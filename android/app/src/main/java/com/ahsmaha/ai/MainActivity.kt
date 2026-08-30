package com.ahsmaha.ai

import android.annotation.SuppressLint
import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.view.View
import android.webkit.CookieManager
import android.webkit.DownloadListener
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import java.net.URL

/**
 * احسمها AI — واجهة أندرويد لسيرفرك.
 *
 * التطبيق ما يشغّل المحرك محليًا (يحتاج غيغابايتات وقاعدة بيانات)،
 * بس يعطيك تجربة تطبيق كاملة: شاشة كاملة، رفع ملفات، تحميل،
 * وسحب للتحديث.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var refreshLayout: SwipeRefreshLayout
    private lateinit var errorView: View
    private lateinit var errorText: TextView

    private var serverUrl: String = ""
    private var pendingFileCallback: ValueCallback<Array<Uri>>? = null

    /** منتقي الملفات — ضروري لرفع الملفات والصور والمواقع. */
    private val filePicker = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult(),
    ) { result ->
        val callback = pendingFileCallback
        pendingFileCallback = null

        if (callback == null) return@registerForActivityResult

        val data = result.data
        val uris: Array<Uri>? = when {
            result.resultCode != RESULT_OK -> null
            data?.clipData != null -> {
                val clip = data.clipData!!
                Array(clip.itemCount) { clip.getItemAt(it).uri }
            }
            data?.data != null -> arrayOf(data.data!!)
            else -> null
        }

        callback.onReceiveValue(uris)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val saved = ServerStore.read(this)
        if (saved == null) {
            startActivity(Intent(this, SetupActivity::class.java))
            finish()
            return
        }
        serverUrl = saved

        setContentView(R.layout.activity_main)
        webView = findViewById(R.id.web_view)
        refreshLayout = findViewById(R.id.refresh)
        errorView = findViewById(R.id.error_view)
        errorText = findViewById(R.id.error_text)

        configureWebView()
        setupRefresh()
        setupErrorActions()
        setupBackNavigation()

        webView.loadUrl(serverUrl)
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView() {
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            // رفع الملفات وفتح النوافذ من الواجهة
            javaScriptCanOpenWindowsAutomatically = true
            setSupportMultipleWindows(false)
            loadWithOverviewMode = true
            useWideViewPort = true
            mediaPlaybackRequiresUserGesture = false
            cacheMode = WebSettings.LOAD_DEFAULT
            // التطبيق يقدّم موقعًا مسؤولًا عن نفسه — نمنع التكبير اليدوي
            builtInZoomControls = false
            displayZoomControls = false
        }

        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest,
            ): Boolean {
                val target = request.url.toString()
                // روابط سيرفرك تفتح داخل التطبيق، والباقي في المتصفح
                return if (isOwnServer(target)) {
                    false
                } else {
                    runCatching {
                        startActivity(Intent(Intent.ACTION_VIEW, request.url))
                    }.onFailure {
                        Toast.makeText(
                            this@MainActivity,
                            R.string.cannot_open_link,
                            Toast.LENGTH_SHORT,
                        ).show()
                    }
                    true
                }
            }

            override fun onPageFinished(view: WebView, url: String) {
                refreshLayout.isRefreshing = false
            }

            override fun onReceivedError(
                view: WebView,
                request: WebResourceRequest,
                error: WebResourceError,
            ) {
                // نعرض الخطأ للصفحة الرئيسية بس، مو لكل صورة ناقصة
                if (request.isForMainFrame) showError()
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                view: WebView,
                filePathCallback: ValueCallback<Array<Uri>>,
                params: FileChooserParams,
            ): Boolean {
                pendingFileCallback?.onReceiveValue(null)
                pendingFileCallback = filePathCallback

                return runCatching {
                    filePicker.launch(params.createIntent())
                    true
                }.getOrElse {
                    pendingFileCallback = null
                    false
                }
            }
        }

        // تحميل الملفات: ZIP والصور والفيديو
        webView.setDownloadListener(
            DownloadListener { url, userAgent, contentDisposition, mimeType, _ ->
                downloadFile(url, userAgent, contentDisposition, mimeType)
            },
        )
    }

    private fun downloadFile(
        url: String,
        userAgent: String,
        contentDisposition: String?,
        mimeType: String?,
    ) {
        runCatching {
            val request = DownloadManager.Request(Uri.parse(url)).apply {
                setMimeType(mimeType)
                addRequestHeader("User-Agent", userAgent)
                // الكوكي ضروري — كل ملفات احسمها تحتاج جلسة
                CookieManager.getInstance().getCookie(url)?.let {
                    addRequestHeader("Cookie", it)
                }
                setNotificationVisibility(
                    DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED,
                )
                val name = android.webkit.URLUtil.guessFileName(url, contentDisposition, mimeType)
                setTitle(name)
                setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name)
            }

            (getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager).enqueue(request)
            Toast.makeText(this, R.string.download_started, Toast.LENGTH_SHORT).show()
        }.onFailure {
            Toast.makeText(this, R.string.download_failed, Toast.LENGTH_SHORT).show()
        }
    }

    private fun setupRefresh() {
        refreshLayout.setOnRefreshListener {
            errorView.visibility = View.GONE
            webView.visibility = View.VISIBLE
            webView.reload()
        }
        refreshLayout.setColorSchemeResources(R.color.brand)
    }

    private fun setupErrorActions() {
        findViewById<Button>(R.id.retry_button).setOnClickListener {
            errorView.visibility = View.GONE
            webView.visibility = View.VISIBLE
            webView.loadUrl(serverUrl)
        }

        findViewById<Button>(R.id.change_server_button).setOnClickListener {
            AlertDialog.Builder(this)
                .setTitle(R.string.change_server_title)
                .setMessage(getString(R.string.change_server_message, serverUrl))
                .setPositiveButton(R.string.change) { _, _ ->
                    ServerStore.clear(this)
                    startActivity(Intent(this, SetupActivity::class.java))
                    finish()
                }
                .setNegativeButton(R.string.cancel, null)
                .show()
        }
    }

    private fun setupBackNavigation() {
        onBackPressedDispatcher.addCallback(
            this,
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    if (webView.canGoBack()) {
                        webView.goBack()
                    } else {
                        isEnabled = false
                        onBackPressedDispatcher.onBackPressed()
                    }
                }
            },
        )
    }

    private fun showError() {
        errorText.text = getString(R.string.error_unreachable, serverUrl)
        errorView.visibility = View.VISIBLE
        webView.visibility = View.GONE
        refreshLayout.isRefreshing = false
    }

    /** هل الرابط يخص سيرفر المستخدم؟ */
    private fun isOwnServer(url: String): Boolean = runCatching {
        URL(url).host.equals(URL(serverUrl).host, ignoreCase = true)
    }.getOrDefault(false)

    override fun onPause() {
        super.onPause()
        // نحفظ الكوكيز فورًا عشان الجلسة ما تضيع
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            CookieManager.getInstance().flush()
        }
    }

    override fun onDestroy() {
        pendingFileCallback?.onReceiveValue(null)
        pendingFileCallback = null
        super.onDestroy()
    }
}
