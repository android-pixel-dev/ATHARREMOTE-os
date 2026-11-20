package com.athar.remoteos

import android.app.Activity
import android.app.AlertDialog
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.inputmethod.EditorInfo
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView

class MainActivity : Activity() {

    private lateinit var messages: LinearLayout
    private lateinit var scroll: ScrollView
    private lateinit var composer: EditText

    private val pageColor = Color.rgb(244, 246, 250)
    private val darkColor = Color.rgb(24, 34, 53)
    private val accentColor = Color.rgb(38, 91, 225)
    private val mutedColor = Color.rgb(120, 132, 150)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        window.statusBarColor = Color.WHITE
        window.navigationBarColor = Color.WHITE
        window.decorView.systemUiVisibility =
            View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR or
            View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(pageColor)
        }

        root.addView(createHeader())

        scroll = ScrollView(this).apply {
            isFillViewport = true
            clipToPadding = false
        }

        messages = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(16), dp(16), dp(20))
        }

        scroll.addView(
            messages,
            ScrollView.LayoutParams(
                ScrollView.LayoutParams.MATCH_PARENT,
                ScrollView.LayoutParams.WRAP_CONTENT
            )
        )

        root.addView(
            scroll,
            LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                0,
                1f
            )
        )

        root.addView(createComposer())
        setContentView(root)

        populateConversation()
    }

    private fun createHeader(): View {
        val header = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(16), dp(13), dp(16), dp(13))
            setBackgroundColor(Color.WHITE)
        }

        val avatar = makeText("A", 21f, Color.WHITE, true).apply {
            gravity = Gravity.CENTER
            background = rounded(accentColor, 16)
        }

        header.addView(avatar, lp(dp(46), dp(46)))

        val details = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(12), 0, 0, 0)
        }

        details.addView(makeText("ATHAR REMOTE OS", 16f, darkColor, true))
        details.addView(makeText("Your companion app", 12f, mutedColor))

        header.addView(
            details,
            LinearLayout.LayoutParams(0, -2, 1f)
        )

        val mode = makeText("LOCAL PREVIEW", 10f, accentColor, true).apply {
            setPadding(dp(9), dp(7), dp(9), dp(7))
            background = rounded(Color.rgb(235, 241, 255), 30)
        }

        header.addView(mode)
        return header
    }

    private fun populateConversation() {
        addDateMarker("TODAY")

        addBubble(
            "Hey! Welcome to ATHAR REMOTE OS. Your companion interface is ready.",
            false
        )

        addBubble(
            "This release is currently in local preview mode. Your phone is not paired with a remote viewer yet.",
            false
        )

        addInfoCard(
            "DEVICE CONNECTION",
            "Status: Not paired\nNo remote session is active in this build."
        )

        addSectionLabel("QUICK ACTIONS")

        val actions = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }

        actions.addView(
            actionChip("Device", {
                showInfo(
                    "Device status",
                    "This is the companion app preview. Device pairing is not active yet."
                )
            }),
            LinearLayout.LayoutParams(0, dp(44), 1f).apply {
                setMargins(0, 0, dp(5), 0)
            }
        )

        actions.addView(
            actionChip("Screen share", {
                showInfo(
                    "Screen sharing",
                    "Screen sharing is not implemented in this release. When added, Android will show its official consent screen before every capture session. You will remain able to stop sharing."
                )
            }),
            LinearLayout.LayoutParams(0, dp(44), 1f).apply {
                setMargins(dp(5), 0, dp(5), 0)
            }
        )

        actions.addView(
            actionChip("Privacy", {
                showPrivacyInfo()
            }),
            LinearLayout.LayoutParams(0, dp(44), 1f).apply {
                setMargins(dp(5), 0, 0, 0)
            }
        )

        messages.addView(actions, lp(-1, -2, bottom = 14))

        addInfoCard(
            "PERMISSIONS",
            "This preview does not need camera, microphone, contacts, location or screen access. Future features will request only the permissions they need."
        )

        addBubble(
            "You can type here to preview the chat interface. Messages are currently stored only on this screen; they are not sent to a server or another device.",
            false
        )
    }

    private fun createComposer(): View {
        val bar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(12), dp(10), dp(12), dp(10))
            setBackgroundColor(Color.WHITE)
        }

        composer = EditText(this).apply {
            hint = "Message ATHAR..."
            textSize = 14f
            setTextColor(darkColor)
            setHintTextColor(mutedColor)
            singleLine = true
            imeOptions = EditorInfo.IME_ACTION_SEND
            setPadding(dp(14), 0, dp(14), 0)
            background = rounded(pageColor, 25)
        }

        val send = makeText("➤", 21f, Color.WHITE, true).apply {
            gravity = Gravity.CENTER
            background = rounded(accentColor, 30)
            setOnClickListener { sendCurrentMessage() }
        }

        bar.addView(
            composer,
            LinearLayout.LayoutParams(0, dp(48), 1f).apply {
                setMargins(0, 0, dp(9), 0)
            }
        )

        bar.addView(send, lp(dp(46), dp(46)))

        composer.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_SEND) {
                sendCurrentMessage()
                true
            } else {
                false
            }
        }

        return bar
    }

    private fun sendCurrentMessage() {
        val value = composer.text.toString().trim()
        if (value.isEmpty()) return

        addBubble(value, true)
        composer.setText("")

        scroll.post {
            addBubble(
                "Local preview only: this message has not been sent to Telegram or a remote device.",
                false
            )
        }
    }

    private fun addBubble(value: String, mine: Boolean) {
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = if (mine) Gravity.END else Gravity.START
        }

        val bubble = makeText(
            value,
            14.5f,
            if (mine) Color.WHITE else darkColor
        ).apply {
            setPadding(dp(14), dp(11), dp(14), dp(11))
            maxWidth = dp(300)
            background = rounded(
                if (mine) accentColor else Color.WHITE,
                18
            )
        }

        row.addView(bubble)

        val stamp = makeText(
            if (mine) "YOU · JUST NOW" else "ATHAR · NOW",
            9f,
            mutedColor,
            true
        ).apply {
            setPadding(dp(4), dp(4), dp(4), 0)
            gravity = if (mine) Gravity.END else Gravity.START
        }

        row.addView(stamp)
        messages.addView(row, lp(-1, -2, bottom = 10))

        scroll.post { scroll.fullScroll(View.FOCUS_DOWN) }
    }

    private fun addInfoCard(title: String, description: String) {
        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(15), dp(14), dp(15), dp(14))
            background = rounded(Color.WHITE, 17)
        }

        card.addView(makeText(title, 12f, accentColor, true))

        val body = makeText(description, 13f, darkColor).apply {
            setPadding(0, dp(8), 0, 0)
        }

        card.addView(body)
        messages.addView(card, lp(-1, -2, top = 4, bottom = 13))
    }

    private fun addSectionLabel(value: String) {
        val label = makeText(value, 11f, mutedColor, true).apply {
            setPadding(dp(2), dp(7), 0, dp(9))
        }
        messages.addView(label)
    }

    private fun addDateMarker(value: String) {
        val label = makeText(value, 10f, mutedColor, true).apply {
            gravity = Gravity.CENTER
            setPadding(0, dp(2), 0, dp(15))
        }
        messages.addView(label)
    }

    private fun actionChip(value: String, action: () -> Unit): TextView {
        return makeText(value, 11f, darkColor, true).apply {
            gravity = Gravity.CENTER
            setPadding(dp(3), 0, dp(3), 0)
            background = rounded(Color.WHITE, 13)
            setOnClickListener { action() }
        }
    }

    private fun showInfo(title: String, body: String) {
        AlertDialog.Builder(this)
            .setTitle(title)
            .setMessage(body)
            .setPositiveButton("OK", null)
            .show()
    }

    private fun showPrivacyInfo() {
        showInfo(
            "Privacy and permissions",
            "This preview does not collect device data or start background screen sharing. Android controls sensitive permission prompts. You can deny a permission and continue using features that do not need it."
        )
    }

    private fun makeText(
        value: String,
        size: Float,
        color: Int,
        bold: Boolean = false
    ): TextView {
        return TextView(this).apply {
            text = value
            textSize = size
            setTextColor(color)
            typeface = if (bold) Typeface.DEFAULT_BOLD else Typeface.DEFAULT
        }
    }

    private fun rounded(color: Int, radius: Int): GradientDrawable {
        return GradientDrawable().apply {
            setColor(color)
            cornerRadius = dp(radius).toFloat()
        }
    }

    private fun dp(value: Int): Int {
        return (value * resources.displayMetrics.density).toInt()
    }

    private fun lp(
        width: Int,
        height: Int,
        left: Int = 0,
        top: Int = 0,
        right: Int = 0,
        bottom: Int = 0
    ): LinearLayout.LayoutParams {
        return LinearLayout.LayoutParams(width, height).apply {
            setMargins(dp(left), dp(top), dp(right), dp(bottom))
        }
    }
}
