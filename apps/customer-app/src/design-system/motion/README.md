# Motion Primitives

**Principle:** no decorative looping animation. `withRepeat` is permitted here and nowhere else. Repeated motion exists only for loading (skeleton/spinner), countdown (OTP resend), or system feedback.

All primitives must respect `useMotionScale()`. At scale 0, durations collapse to 0 and position-based animations degrade to opacity changes.
