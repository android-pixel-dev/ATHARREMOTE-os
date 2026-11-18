package com.athar.remoteos

import android.app.Activity
import android.os.Bundle
import android.graphics.Color
import android.view.Gravity
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

class MainActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(32, 32, 32, 32)
            setBackgroundColor(Color.rgb(12, 15, 24))
        }

        val title = TextView(this).apply {
            text = "ATHAR REMOTE OS"
            textSize = 26f
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
        }

        val status = TextView(this).apply {
            text = "Companion installed\n\nScreen sharing is OFF.\nNo remote session is active."
            textSize = 16f
            setTextColor(Color.LTGRAY)
            gravity = Gravity.CENTER
            setPadding(0, 28, 0, 28)
        }

        root.addView(title)
        root.addView(status)
        root.addView(Button(this).apply {
            text = "Screen sharing — not enabled yet"
            isEnabled = false
        })

        setContentView(root)
    }
}
