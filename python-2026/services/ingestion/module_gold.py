"""Hand-authored module fixtures used only for Phase 4 alignment evaluation."""

from __future__ import annotations

SONICWAVE_GOLD_MODULES = [
    {
        "name": "Authentication",
        "description": "Account registration, login, OAuth, 2FA, sessions and password policy.",
    },
    {
        "name": "Music Streaming",
        "description": "Audio playback, quality, crossfade, shuffle, repeat and advertising.",
    },
    {
        "name": "Playlist Management",
        "description": "Create, edit, share and synchronise playlists.",
    },
    {
        "name": "Offline Mode",
        "description": "Premium downloads, offline playback, cache and DRM expiry.",
    },
    {
        "name": "Search & Filtering",
        "description": "Search, suggestions, filters, typo tolerance and history.",
    },
    {
        "name": "Recommendations",
        "description": "Personalised playlists, suggestions and radio discovery.",
    },
    {
        "name": "Payments",
        "description": "Premium subscription, payment, invoice, cancellation and payment failure.",
    },
    {
        "name": "Notifications",
        "description": "Transactional emails, confirmations and system alerts.",
    },
    {
        "name": "Admin & Moderation",
        "description": "Account administration, content moderation and back office.",
    },
    {
        "name": "Artist Portal",
        "description": "Artist uploads, metadata, profile and listening statistics.",
    },
    {
        "name": "Performance & Reliability",
        "description": "Latency, availability, scale and failover.",
    },
    {
        "name": "Security",
        "description": "TLS, DRM, passwords, account lockout and privacy compliance.",
    },
    {
        "name": "Accessibility",
        "description": "WCAG, screen readers, keyboard navigation and contrast.",
    },
]

GOLD_MODULE_FIXTURES = {"sonicwave": SONICWAVE_GOLD_MODULES}
