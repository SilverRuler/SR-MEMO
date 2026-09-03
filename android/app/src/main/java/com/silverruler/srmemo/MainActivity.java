package com.silverruler.srmemo;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

public class MainActivity extends Activity {
    private static final String HOME_URL = "https://memo.silverruler.xyz:2096";
    private static final long REFRESH_TIMEOUT_MS = 4000;

    // JS that "exits" a selected section back to the section list.
    // Returns "true" if it had something to deselect, "false" otherwise.
    private static final String BACK_JS =
        "(function(){try{" +
            "if(typeof cur!=='undefined' && cur!==null){" +
                "cur=null;" +
                "var ui=document.getElementById('ui');" +
                "var acts=document.getElementById('acts');" +
                "var title=document.getElementById('title');" +
                "var sidebar=document.getElementById('sidebar');" +
                "if(ui)ui.style.display='none';" +
                "if(acts)acts.style.display='none';" +
                "if(title)title.innerText='Select Section';" +
                "if(sidebar)sidebar.classList.add('open');" +
                "return true;" +
            "}" +
        "}catch(e){}return false;})();";

    // Soft refresh: if a section is currently selected, just rerun the dashboard's
    // own load() (which re-fetches /api/data and re-renders) so the user stays in
    // that section. Signals completion back to Android via SRMemo.refreshDone().
    // Returns "true" if a soft refresh was triggered, "false" if caller should
    // fall back to a full WebView reload.
    private static final String SOFT_REFRESH_JS =
        "(function(){try{" +
            "if(typeof cur!=='undefined' && cur!==null && typeof load==='function'){" +
                "var done=function(){try{if(window.SRMemo)SRMemo.refreshDone();}catch(e){}};" +
                "var p=load();" +
                "if(p&&typeof p.then==='function'){p.then(done,done);}else{done();}" +
                "return true;" +
            "}" +
        "}catch(e){}return false;})();";

    private WebView webView;
    private SwipeRefreshLayout swipeRefresh;
    private final Runnable stopRefreshing = new Runnable() {
        @Override
        public void run() {
            if (swipeRefresh != null) swipeRefresh.setRefreshing(false);
        }
    };

    @SuppressLint("AddJavascriptInterface")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        swipeRefresh = new SwipeRefreshLayout(this);
        swipeRefresh.addView(webView, new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));
        swipeRefresh.setColorSchemeColors(Color.parseColor("#1a73e8"));
        setContentView(swipeRefresh);

        WebSettings webSettings = webView.getSettings();
        webSettings.setJavaScriptEnabled(true);
        webSettings.setDomStorageEnabled(true);
        webSettings.setDatabaseEnabled(true);
        webSettings.setLoadWithOverviewMode(true);
        webSettings.setUseWideViewPort(true);
        webSettings.setSupportZoom(false);
        webSettings.setCacheMode(WebSettings.LOAD_DEFAULT);

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, true);

        webView.addJavascriptInterface(new JsBridge(), "SRMemo");
        webView.setWebChromeClient(new WebChromeClient());

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                view.loadUrl(url);
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                CookieManager.getInstance().flush();
                stopRefreshSpinner();
            }
        });

        // Only let pull-to-refresh kick in when the WebView is scrolled to the top,
        // otherwise it fights with in-page scrolling.
        webView.setOnScrollChangeListener(new View.OnScrollChangeListener() {
            @Override
            public void onScrollChange(View v, int scrollX, int scrollY, int oldX, int oldY) {
                swipeRefresh.setEnabled(scrollY == 0);
            }
        });

        swipeRefresh.setOnRefreshListener(new SwipeRefreshLayout.OnRefreshListener() {
            @Override
            public void onRefresh() {
                webView.evaluateJavascript(SOFT_REFRESH_JS, value -> {
                    if ("true".equals(value)) {
                        // Soft refresh in flight. SRMemo.refreshDone() will stop the
                        // spinner; arm a fallback timeout in case it never fires.
                        swipeRefresh.removeCallbacks(stopRefreshing);
                        swipeRefresh.postDelayed(stopRefreshing, REFRESH_TIMEOUT_MS);
                    } else {
                        // No section selected (or page not ready) — do a full reload.
                        webView.reload();
                    }
                });
            }
        });

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
        } else {
            webView.loadUrl(HOME_URL);
        }
    }

    private void stopRefreshSpinner() {
        if (swipeRefresh == null) return;
        swipeRefresh.removeCallbacks(stopRefreshing);
        swipeRefresh.setRefreshing(false);
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        webView.saveState(outState);
    }

    @Override
    protected void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            webView.evaluateJavascript(BACK_JS, value -> {
                if ("true".equals(value)) {
                    return; // section was deselected; stay in app
                }
                if (webView.canGoBack()) {
                    webView.goBack();
                } else {
                    finish();
                }
            });
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    private class JsBridge {
        @JavascriptInterface
        public void refreshDone() {
            runOnUiThread(MainActivity.this::stopRefreshSpinner);
        }
    }
}
