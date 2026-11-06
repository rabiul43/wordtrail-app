# Home screen 2 + "App design" switch

Settings > Reading > App design: Classic | Storytel-style | Modern (saved as P.design; old saves with homeNew=false = Classic, everything else = Modern).
- <html data-home="st"> = Storytel-style or Modern; <html data-design="modern"> = Modern. Phones only. Set by applyHome() (090) and the first-paint script (00-head.html).
- Modern only: Explore hero/chips/level tiles (110), greeting + goal strip + time-of-day shelf (120), Book of the day card + "Today's pick" (105), Downloaded shelf (#ex-dl, homeDownloads in 120), chips/mini-player restyle (99i css). Classic and Storytel-style render exactly as before (the old Explore hero/"jump" chips are back in those modes).
- Modern puts the time-of-day shelf above Book of the day (homeOrder in 090) and shows Book of the day under Continue listening.
- Replaced the old "New Home design" switch (#in-home) with the 3-way selector (#seg-design).
