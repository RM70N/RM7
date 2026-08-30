package com.ahsmaha.ai

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.ProgressBar
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

/**
 * شاشة أول تشغيل — تحدد فيها عنوان سيرفرك.
 * نتحقق من الاتصال قبل ما نحفظ، عشان ما تدخل على عنوان غلط.
 */
class SetupActivity : AppCompatActivity() {

    private lateinit var input: EditText
    private lateinit var connectButton: Button
    private lateinit var progress: ProgressBar
    private lateinit var status: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_setup)

        input = findViewById(R.id.server_input)
        connectButton = findViewById(R.id.connect_button)
        progress = findViewById(R.id.progress)
        status = findViewById(R.id.status)

        ServerStore.read(this)?.let { input.setText(it) }

        connectButton.setOnClickListener { attemptConnect() }
    }

    private fun attemptConnect() {
        val url = ServerStore.normalize(input.text.toString())
        if (url == null) {
            showStatus(getString(R.string.setup_invalid), isError = true)
            return
        }

        setBusy(true)
        showStatus(getString(R.string.setup_checking), isError = false)

        thread {
            val result = probe(url)
            runOnUiThread {
                setBusy(false)
                if (result == null) {
                    ServerStore.write(this, url)
                    startActivity(Intent(this, MainActivity::class.java))
                    finish()
                } else {
                    showStatus(result, isError = true)
                }
            }
        }
    }

    /** يرجع null إذا الاتصال نجح، أو رسالة الخطأ بالعربي. */
    private fun probe(baseUrl: String): String? {
        return try {
            val connection = (URL("$baseUrl/api/health").openConnection() as HttpURLConnection).apply {
                connectTimeout = 12_000
                readTimeout = 12_000
                requestMethod = "GET"
                instanceFollowRedirects = true
            }

            try {
                val code = connection.responseCode
                val body = if (code in 200..299) {
                    connection.inputStream.bufferedReader().use { it.readText() }
                } else {
                    ""
                }

                when {
                    code !in 200..299 -> getString(R.string.setup_bad_status, code)
                    !body.contains("\"ok\"") -> getString(R.string.setup_not_ahsmaha)
                    else -> null
                }
            } finally {
                connection.disconnect()
            }
        } catch (error: Exception) {
            getString(R.string.setup_unreachable)
        }
    }

    private fun setBusy(busy: Boolean) {
        connectButton.isEnabled = !busy
        input.isEnabled = !busy
        progress.visibility = if (busy) View.VISIBLE else View.GONE
    }

    private fun showStatus(message: String, isError: Boolean) {
        status.visibility = View.VISIBLE
        status.text = message
        status.setTextColor(
            getColor(if (isError) R.color.status_error else R.color.status_muted),
        )
    }
}
