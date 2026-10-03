package com.panchayatdigital.candidateapp

import android.annotation.SuppressLint
import android.app.DownloadManager
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream

class MainActivity : AppCompatActivity() {
    private lateinit var web: WebView
    private var fileChooserCallback: ValueCallback<Array<Uri>>? = null
    private val fileChooserRequestCode = 1401

    companion object {
        private const val START_URL = "https://www.panchayatx.com/login/"
    }

    @SuppressLint("SetJavaScriptEnabled", "JavascriptInterface")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        web = WebView(this)
        setContentView(web)

        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true)

        with(web.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            allowFileAccess = false
            allowContentAccess = true
            javaScriptCanOpenWindowsAutomatically = false
            setSupportMultipleWindows(false)
            useWideViewPort = false
            loadWithOverviewMode = false
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
            textZoom = 100
            userAgentString = userAgentString + " PanchayatXAndroid/2.1"
        }

        web.addJavascriptInterface(DownloadBridge(), "AndroidDownloader")

        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                return handleNavigation(request.url)
            }

            @Suppress("DEPRECATION")
            override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean {
                return handleNavigation(Uri.parse(url))
            }
        }

        web.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                webView: WebView,
                filePathCallback: ValueCallback<Array<Uri>>,
                fileChooserParams: FileChooserParams
            ): Boolean {
                this@MainActivity.fileChooserCallback?.onReceiveValue(null)
                this@MainActivity.fileChooserCallback = filePathCallback
                return try {
                    startActivityForResult(fileChooserParams.createIntent(), fileChooserRequestCode)
                    true
                } catch (_: ActivityNotFoundException) {
                    this@MainActivity.fileChooserCallback = null
                    Toast.makeText(this@MainActivity, "File picker उपलब्ध नहीं है।", Toast.LENGTH_SHORT).show()
                    false
                }
            }
        }

        web.setDownloadListener { url, userAgent, contentDisposition, mimeType, _ ->
            val guessedName = URLUtil.guessFileName(url, contentDisposition, mimeType)
                .ifBlank { "PanchayatX_" + System.currentTimeMillis() + ".pdf" }

            if (url.startsWith("blob:", ignoreCase = true)) {
                downloadBlob(url, guessedName, mimeType.ifBlank { "application/pdf" })
            } else {
                downloadHttp(url, userAgent, mimeType, guessedName)
            }
        }

        if (savedInstanceState == null) {
            web.loadUrl(START_URL)
        } else {
            web.restoreState(savedInstanceState)
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (web.canGoBack()) web.goBack() else finish()
            }
        })
    }

    private fun handleNavigation(uri: Uri): Boolean {
        val scheme = (uri.scheme ?: "").lowercase()

        if (scheme == "http" || scheme == "https") {
            val host = (uri.host ?: "").lowercase()
            val internal = host == "panchayatx.com" ||
                host == "www.panchayatx.com" ||
                host.endsWith(".panchayatx.com") ||
                host == "panchayat-election-sable.vercel.app"

            if (internal) {
                val path = (uri.path ?: "/").lowercase()
                if (path == "/" || path == "/index.html") {
                    web.loadUrl(START_URL)
                    return true
                }
                return false
            }
            openExternal(uri)
            return true
        }

        if (scheme == "about" || scheme == "data" || scheme == "blob") return false

        openExternal(uri)
        return true
    }

    private fun openExternal(uri: Uri) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, uri))
        } catch (_: Exception) {
            Toast.makeText(this, "इस link के लिए compatible app नहीं मिला।", Toast.LENGTH_SHORT).show()
        }
    }

    private fun downloadHttp(url: String, userAgent: String, mimeType: String, fileName: String) {
        try {
            val request = DownloadManager.Request(Uri.parse(url))
                .setTitle(fileName)
                .setDescription("PanchayatX file")
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                .setMimeType(mimeType)
                .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName)

            if (userAgent.isNotBlank()) request.addRequestHeader("User-Agent", userAgent)
            CookieManager.getInstance().getCookie(url)?.let { cookie ->
                if (cookie.isNotBlank()) request.addRequestHeader("Cookie", cookie)
            }

            val manager = getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
            manager.enqueue(request)
            Toast.makeText(this, "Download शुरू हो गया।", Toast.LENGTH_SHORT).show()
        } catch (e: Exception) {
            Toast.makeText(this, "Download शुरू नहीं हुआ: " + e.message, Toast.LENGTH_LONG).show()
        }
    }

    private fun downloadBlob(url: String, fileName: String, mimeType: String) {
        val js = """
            (function(){
              fetch(JOBLOBURL)
                .then(function(r){ return r.blob(); })
                .then(function(blob){
                  var reader = new FileReader();
                  reader.onloadend = function(){
                    AndroidDownloader.saveBase64(
                      reader.result,
                      JOFILENAME,
                      JOMIMETYPE
                    );
                  };
                  reader.readAsDataURL(blob);
                })
                .catch(function(err){ AndroidDownloader.downloadError(String(err)); });
            })();
        """.trimIndent()
            .replace("JOBLOBURL", JSONObject.quote(url))
            .replace("JOFILENAME", JSONObject.quote(fileName))
            .replace("JOMIMETYPE", JSONObject.quote(mimeType))

        web.evaluateJavascript(js, null)
    }

    inner class DownloadBridge {
        @JavascriptInterface
        fun saveBase64(dataUrl: String, fileName: String, mimeType: String) {
            try {
                val encoded = dataUrl.substringAfter(",", "")
                if (encoded.isBlank()) throw IllegalArgumentException("Empty file data")
                val bytes = Base64.decode(encoded, Base64.DEFAULT)
                val safeName = fileName
                    .replace(Regex("[\\/:*?\"<>|]"), "_")
                    .ifBlank { "PanchayatX_" + System.currentTimeMillis() + ".pdf" }

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    val values = android.content.ContentValues().apply {
                        put(MediaStore.Downloads.DISPLAY_NAME, safeName)
                        put(MediaStore.Downloads.MIME_TYPE, mimeType.ifBlank { "application/pdf" })
                        put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/PanchayatX")
                    }
                    val uri = contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                        ?: throw IllegalStateException("Download file create नहीं हुई")
                    contentResolver.openOutputStream(uri)?.use { it.write(bytes) }
                        ?: throw IllegalStateException("Download file write नहीं हुई")
                } else {
                    val dir = File(getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "PanchayatX")
                    if (!dir.exists()) dir.mkdirs()
                    FileOutputStream(File(dir, safeName)).use { it.write(bytes) }
                }

                runOnUiThread {
                    Toast.makeText(
                        this@MainActivity,
                        "PDF Downloads/PanchayatX में save हो गई।",
                        Toast.LENGTH_LONG
                    ).show()
                }
            } catch (e: Exception) {
                runOnUiThread {
                    Toast.makeText(
                        this@MainActivity,
                        "PDF save नहीं हुई: " + e.message,
                        Toast.LENGTH_LONG
                    ).show()
                }
            }
        }

        @JavascriptInterface
        fun downloadError(message: String) {
            runOnUiThread {
                Toast.makeText(this@MainActivity, "PDF download error: " + message, Toast.LENGTH_LONG).show()
            }
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode == fileChooserRequestCode) {
            val result = WebChromeClient.FileChooserParams.parseResult(resultCode, data)
            fileChooserCallback?.onReceiveValue(result)
            fileChooserCallback = null
            return
        }
        super.onActivityResult(requestCode, resultCode, data)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        web.saveState(outState)
        super.onSaveInstanceState(outState)
    }

    override fun onDestroy() {
        fileChooserCallback?.onReceiveValue(null)
        fileChooserCallback = null
        web.removeJavascriptInterface("AndroidDownloader")
        web.destroy()
        super.onDestroy()
    }
}
