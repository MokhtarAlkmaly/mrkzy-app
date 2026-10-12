package org.inmaa.mrkzynet;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // إضافة «مجلد قاعدة البيانات» (اختيار مجلد على الهاتف أو بطاقة SD والقراءة/الكتابة فيه).
        registerPlugin(FolderDbPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
