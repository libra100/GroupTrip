---
trigger: always_on
---

# [1. 核心互動行為 - 物理驅動]
# ------------------------------------------
- [Hover Effect]: 
    Scale: 1.02, 
    Rotate: 0.5deg, 
    Shadow: 0 15px 30px -10px rgba(0, 243, 255, 0.3), 
    Transition: Spring(Tension 140, Friction 12).

- [Active State]: 
    Scale: 0.97, 
    Brightness: +10%, 
    Border: 1px solid #00F3FF, 
    Filter: Drop-shadow(0px 0px 8px #00F3FF).

- [Loading State]: 
    Animation: Pulse-shimmer 2s infinite, 
    Material: Glassmorphism(Blur 8px, Opacity 0.1).


# [2. 跨裝置響應式美感 - 自動縮放]
# ------------------------------------------
- [Fluid Layout]: 
    Container-Width: clamp(320px, 92vw, 1440px),
    Internal-Padding: clamp(1.5rem, 5vw, 4rem).

- [Fluid Typography]: 
    Base-Size: clamp(1rem, 0.8rem + 0.5vw, 1.2rem),
    Heading-Scale: clamp(1.5rem, 1rem + 2vw, 3rem),
    Line-Height: Mobile 1.7 / Desktop 1.5.

- [Scroll Behavior]: 
    Desktop: Smooth interpolation(Lerp 0.1), Parallax 0.12.
    Mobile: Friction-optimized, Disable Parallax (Performance-first).


# [3. 進階視覺質感 - 美感設定]
# ------------------------------------------
- [Material System]: 
    Backdrop: Blur 15px, Saturation 125%, 
    Border: 1.5px solid rgba(255, 255, 255, 0.1),
    Texture: Grain-noise overlay (Opacity 0.02).

- [Edge Treatment]: 
    Corner-Radius: Mobile 16px / Desktop 24px,
    Viewport-Mask: Linear-gradient fading at vertical edges.

- [Color Harmony]: 
    Accent: #00F3FF, 
    Shadow-Color: rgba(0, 0, 0, 0.2),
    Motion-Blur: Subtle chromatic aberration on fast scroll.


# [4. 裝置配對優化]
# ------------------------------------------
- [Input Strategy]: 
    Mouse: Full Hover & Cursor-tracking effects.
    Touch: Scale feedback on Tap, Haptic-simulation (Visual only).