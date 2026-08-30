package com.ahsmaha.ai

import android.content.Context
import androidx.core.content.edit

/**
 * يحفظ عنوان سيرفر احسمها.
 * التطبيق واجهة لسيرفرك — فيحتاج يعرف وين يلقاه.
 */
object ServerStore {
    private const val PREFS = "ahsmaha"
    private const val KEY_URL = "server_url"

    fun read(context: Context): String? =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY_URL, null)
            ?.takeIf { it.isNotBlank() }

    fun write(context: Context, url: String) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit {
            putString(KEY_URL, url)
        }
    }

    fun clear(context: Context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit {
            remove(KEY_URL)
        }
    }

    /**
     * ينظّف العنوان اللي كتبه المستخدم:
     * يضيف البروتوكول إذا ناقص، ويشيل الشرطة الأخيرة والمسافات.
     */
    fun normalize(raw: String): String? {
        var value = raw.trim()
        if (value.isEmpty()) return null

        if (!value.startsWith("http://") && !value.startsWith("https://")) {
            value = "http://$value"
        }
        value = value.trimEnd('/')

        // تحقق بسيط: لازم يكون فيه مضيف بعد البروتوكول
        val host = value.substringAfter("://").substringBefore('/').substringBefore(':')
        if (host.isEmpty() || host.contains(' ')) return null

        return value
    }
}
