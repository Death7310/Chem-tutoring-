package io.github.death7310.chemtutor;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.OutputStream;

/**
 * Hosts the Chem Tutor web app (https://death7310.github.io/Chem-tutoring-/) in a full-screen
 * WebView, adding what a browser normally provides: file picking, the camera, and saving backups.
 */
public class MainActivity extends Activity {
    private static final String START_URL = "https://death7310.github.io/Chem-tutoring-/";
    private static final String HOST = "death7310.github.io";
    private static final String PATH_PREFIX = "/Chem-tutoring-";
    private static final int FILE_REQUEST = 1;

    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
    /** Where the camera app writes its photo, when the camera was opened. */
    private Uri cameraUri;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setUserAgentString(settings.getUserAgentString() + " ChemTutorAndroid");

        webView.addJavascriptInterface(new Bridge(), "AndroidBridge");
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (isAppUrl(url)) return false;
                // Everything else (Anthropic console, OpenStax, help links) opens in the browser.
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, url));
                } catch (ActivityNotFoundException ignored) {
                    // No app can open it; stay put.
                }
                return true;
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                return showFileChooser(callback, params);
            }
        });

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
        } else {
            webView.loadUrl(START_URL);
        }
    }

    private static boolean isAppUrl(Uri url) {
        String path = url.getPath() == null ? "" : url.getPath();
        return "https".equals(url.getScheme()) && HOST.equals(url.getHost()) && path.startsWith(PATH_PREFIX);
    }

    // MARK: - File picking and camera

    private boolean showFileChooser(ValueCallback<Uri[]> callback, WebChromeClient.FileChooserParams params) {
        if (filePathCallback != null) filePathCallback.onReceiveValue(null);
        filePathCallback = callback;
        cameraUri = null;

        boolean images = acceptsOnlyImages(params.getAcceptTypes());
        Intent intent = null;
        if (images && params.isCaptureEnabled()) intent = cameraIntent();
        if (intent == null) {
            intent = new Intent(Intent.ACTION_GET_CONTENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            // Book files (EPUB especially) are often mislabeled by file managers, so only images are filtered.
            intent.setType(images ? "image/*" : "*/*");
            if (params.getMode() == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE) {
                intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
            }
        }
        try {
            startActivityForResult(intent, FILE_REQUEST);
            return true;
        } catch (ActivityNotFoundException e) {
            filePathCallback = null;
            cameraUri = null;
            Toast.makeText(this, "No app available to pick files", Toast.LENGTH_SHORT).show();
            return false;
        }
    }

    private static boolean acceptsOnlyImages(String[] acceptTypes) {
        if (acceptTypes == null || acceptTypes.length == 0) return false;
        for (String type : acceptTypes) {
            if (type == null || !type.trim().startsWith("image/")) return false;
        }
        return true;
    }

    /** Opens the camera app, which saves the photo to Pictures/Chem Tutor. */
    private Intent cameraIntent() {
        ContentValues values = new ContentValues();
        values.put(MediaStore.Images.Media.DISPLAY_NAME, "chem-tutor-" + System.currentTimeMillis() + ".jpg");
        values.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
        values.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/Chem Tutor");
        try {
            cameraUri = getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
        } catch (RuntimeException e) {
            cameraUri = null;
        }
        if (cameraUri == null) return null;
        Intent intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
        intent.putExtra(MediaStore.EXTRA_OUTPUT, cameraUri);
        intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
        return intent;
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode != FILE_REQUEST || filePathCallback == null) {
            super.onActivityResult(requestCode, resultCode, data);
            return;
        }
        Uri[] result = null;
        if (resultCode == RESULT_OK) {
            if (cameraUri != null) {
                result = new Uri[] {cameraUri};
            } else if (data != null) {
                ClipData clip = data.getClipData();
                if (clip != null) {
                    result = new Uri[clip.getItemCount()];
                    for (int i = 0; i < clip.getItemCount(); i++) result[i] = clip.getItemAt(i).getUri();
                } else if (data.getData() != null) {
                    result = new Uri[] {data.getData()};
                }
            }
        } else if (cameraUri != null) {
            // Cancelled: remove the empty photo entry.
            getContentResolver().delete(cameraUri, null, null);
        }
        filePathCallback.onReceiveValue(result);
        filePathCallback = null;
        cameraUri = null;
    }

    // MARK: - Saving files (study-data backups)

    /** Called from the web app, since a WebView can't download blob: URLs by itself. */
    private class Bridge {
        @JavascriptInterface
        public void saveFile(String base64, String fileName, String mimeType) {
            try {
                byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.DISPLAY_NAME, fileName);
                values.put(MediaStore.Downloads.MIME_TYPE, mimeType);
                values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (uri == null) throw new IllegalStateException("Couldn't create the file");
                try (OutputStream out = getContentResolver().openOutputStream(uri)) {
                    if (out == null) throw new IllegalStateException("Couldn't open the file");
                    out.write(bytes);
                }
                toast("Saved to Downloads: " + fileName);
            } catch (Exception e) {
                toast("Couldn't save the file: " + e.getMessage());
            }
        }
    }

    private void toast(String message) {
        runOnUiThread(() -> Toast.makeText(this, message, Toast.LENGTH_LONG).show());
    }

    // MARK: - Lifecycle

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        webView.saveState(outState);
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        webView.destroy();
        super.onDestroy();
    }
}
