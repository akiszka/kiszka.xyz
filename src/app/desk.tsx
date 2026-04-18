"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import Image from "next/image";

const REF_W = 1100;
const REF_H = 980;

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

/** CSS expression for viewport-responsive top positioning.
 *  Matches the JS formula: py * max(100vh, REF_H) / REF_H
 *  - Tall viewport: scales up proportionally
 *  - Short viewport: floors at design value (stage has min-height: REF_H) */
function cssTop(py: number): string {
  return `max(${((py / REF_H) * 100).toFixed(2)}vh, ${py}px)`;
}

export default function Desk() {
  const stageRef = useRef<HTMLElement>(null);
  const photoRef = useRef<HTMLElement>(null);
  const resetRef = useRef<() => void>(null);
  const [clockText, setClockText] = useState("");
  const [tapeState, setTapeState] = useState<
    "attached" | "peeled" | "flung" | "gone"
  >("attached");

  // Layout adjustment, drag, collision
  useEffect(() => {
    const stageEl = stageRef.current;
    if (!stageEl) return;
    const stage = stageEl;

    const objs = Array.from(stage.querySelectorAll<HTMLElement>(".obj"));
    let isFlow = false;
    let topZ = 10;

    function checkFlow() {
      isFlow = window.matchMedia("(max-width: 960px)").matches;
    }

    // Stage needs enough height for the desk objects
    function updateStageHeight() {
      checkFlow();
      stage.style.minHeight = isFlow
        ? ""
        : Math.max(window.innerHeight, REF_H) + "px";
    }

    // Clamp horizontal positions on narrow desktops (960–1100px).
    // Vertical positioning is handled entirely by CSS via cssTop().
    function adjustLeftPositions() {
      checkFlow();
      if (isFlow) return;
      const sw = stage.clientWidth;
      const scale = Math.min(sw / REF_W, 1);
      objs.forEach((el) => {
        if (el.dataset.userMoved) return;
        const px = parseFloat(el.dataset.px!);
        el.style.left =
          clamp(px * scale, 6, sw - el.offsetWidth - 6) + "px";
      });
    }

    updateStageHeight();
    adjustLeftPositions();

    // Enable smooth transitions only after initial positions are painted
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        stage.classList.add("ready");
      });
    });

    const onResize = () => {
      updateStageHeight();
      adjustLeftPositions();
    };
    window.addEventListener("resize", onResize);

    // --- Collision ---
    function rectOf(el: HTMLElement) {
      return {
        l: parseFloat(el.style.left) || el.offsetLeft,
        t: parseFloat(el.style.top) || el.offsetTop,
        w: el.offsetWidth,
        h: el.offsetHeight,
        el,
      };
    }

    function overlaps(
      a: ReturnType<typeof rectOf>,
      b: ReturnType<typeof rectOf>
    ) {
      const pad = 4;
      return !(
        a.l + a.w < b.l + pad ||
        b.l + b.w < a.l + pad ||
        a.t + a.h < b.t + pad ||
        b.t + b.h < a.t + pad
      );
    }

    function resolveCollisions(moved: HTMLElement) {
      if (isFlow) return;
      const mv = rectOf(moved);
      const sw = stage.clientWidth;
      const sh = stage.clientHeight;

      objs.forEach((el) => {
        if (el === moved) return;
        const o = rectOf(el);
        if (!overlaps(mv, o)) return;
        const pushR = mv.l + mv.w - o.l;
        const pushL = o.l + o.w - mv.l;
        const pushD = mv.t + mv.h - o.t;
        const pushU = o.t + o.h - mv.t;
        const min = Math.min(pushR, pushL, pushD, pushU);
        let dx = 0;
        let dy = 0;
        if (min === pushR) dx = pushR + 6;
        else if (min === pushL) dx = -(pushL + 6);
        else if (min === pushD) dy = pushD + 6;
        else dy = -(pushU + 6);
        el.style.left = clamp(o.l + dx, 6, sw - o.w - 6) + "px";
        el.style.top = clamp(o.t + dy, 6, sh - o.h - 6) + "px";
        el.dataset.userMoved = "1";
      });
    }

    // --- Drag ---
    const cleanups: (() => void)[] = [];

    objs.forEach((el) => {
      let sx = 0;
      let sy = 0;
      let ox = 0;
      let oy = 0;
      let down = false;

      const onDown = (e: PointerEvent) => {
        if (isFlow) return;
        if ((e.target as HTMLElement).closest("a")) return;
        if ((e.target as HTMLElement).classList.contains("tape")) return;
        down = true;
        el.classList.add("dragging");
        el.style.zIndex = String(++topZ);
        sx = e.clientX;
        sy = e.clientY;
        // Use offsetLeft/Top — works whether style.left is a pixel value
        // or a CSS expression like max(...)
        ox = el.offsetLeft;
        oy = el.offsetTop;
        try {
          el.setPointerCapture(e.pointerId);
        } catch {}
      };

      const onMove = (e: PointerEvent) => {
        if (!down) return;
        const sw = stage.clientWidth;
        const sh = stage.clientHeight;
        el.style.left =
          clamp(ox + e.clientX - sx, 6, sw - el.offsetWidth - 6) + "px";
        el.style.top =
          clamp(oy + e.clientY - sy, 6, sh - el.offsetHeight - 6) + "px";
        el.dataset.userMoved = "1";
        resolveCollisions(el);
      };

      const onUp = (e: PointerEvent) => {
        if (!down) return;
        down = false;
        el.classList.remove("dragging");
        try {
          el.releasePointerCapture(e.pointerId);
        } catch {}
        resolveCollisions(el);
      };

      el.addEventListener("pointerdown", onDown);
      el.addEventListener("pointermove", onMove);
      el.addEventListener("pointerup", onUp);
      el.addEventListener("pointercancel", onUp);
      cleanups.push(() => {
        el.removeEventListener("pointerdown", onDown);
        el.removeEventListener("pointermove", onMove);
        el.removeEventListener("pointerup", onUp);
        el.removeEventListener("pointercancel", onUp);
      });
    });

    // --- Reset ---
    resetRef.current = () => {
      objs.forEach((el) => {
        delete el.dataset.userMoved;
        el.style.zIndex = "";
        // Restore viewport-responsive top and rotation
        const py = parseFloat(el.dataset.py!);
        const rot = parseFloat(el.dataset.rot!) || 0;
        el.style.top = cssTop(py);
        el.style.transform = `rotate(${rot}deg)`;
      });
      // Restore clamped left positions
      adjustLeftPositions();
    };

    return () => {
      window.removeEventListener("resize", onResize);
      cleanups.forEach((fn) => fn());
    };
  }, []);

  // Desk bump: after inactivity, nudge all cards via WAAPI to show they're movable
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    let cancelled = false;
    const cancel = () => {
      cancelled = true;
    };
    stage.addEventListener("pointerdown", cancel, { once: true });

    const timer = setTimeout(() => {
      if (cancelled) return;
      if (window.matchMedia("(max-width: 960px)").matches) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

      const objs = Array.from(stage.querySelectorAll<HTMLElement>(".obj"));
      if (objs.some((el) => el.dataset.userMoved)) return;

      objs.forEach((el) => {
        const bump = 5 + Math.random() * 7;
        el.animate(
          [
            { translate: "0 0" },
            { translate: `0 ${bump}px` },
            { translate: "0 0" },
          ],
          { duration: 700, easing: "cubic-bezier(0.22, 1.2, 0.36, 1)" }
        );
      });
    }, 3000);

    return () => {
      clearTimeout(timer);
      stage.removeEventListener("pointerdown", cancel);
    };
  }, []);

  // Tape lift: periodic WAAPI animation to suggest the tape is peelable
  useEffect(() => {
    if (tapeState !== "attached") return;
    const photo = photoRef.current;
    if (!photo) return;
    const tape = photo.querySelector<HTMLElement>(".tape");
    if (!tape) return;
    if (window.matchMedia("(max-width: 960px)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let anim: Animation | null = null;
    let intervalId: ReturnType<typeof setInterval> | undefined;

    const lift = () => {
      anim?.cancel();
      anim = tape.animate(
        [
          { transform: "translateX(-50%) rotate(-3deg)" },
          { transform: "translateX(-50%) rotate(-10deg) translateY(-3px)" },
          { transform: "translateX(-50%) rotate(-3deg)" },
        ],
        { duration: 600, easing: "ease-in-out" }
      );
    };

    const startTimer = setTimeout(() => {
      lift();
      intervalId = setInterval(lift, 6000);
    }, 5000);

    return () => {
      clearTimeout(startTimer);
      if (intervalId) clearInterval(intervalId);
      anim?.cancel();
    };
  }, [tapeState]);

  // Hint settle: brief emphasis via WAAPI so the hint catches the eye on load
  useEffect(() => {
    const hint = stageRef.current?.querySelector<HTMLElement>(".hint");
    if (!hint) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const anim = hint.animate(
      [
        { color: "#111", offset: 0 },
        { color: "#111", offset: 0.4 },
        { color: "#6b6b6b", offset: 1 },
      ],
      { duration: 5000, fill: "both", easing: "ease-out" }
    );

    return () => anim.cancel();
  }, []);

  // Warsaw clock
  useEffect(() => {
    const tick = () => {
      const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/Warsaw",
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
        hour12: false,
      }).formatToParts(new Date());
      const get = (t: Intl.DateTimeFormatPartTypes) =>
        parts.find((p) => p.type === t)!.value;
      setClockText(
        `warsaw \u00b7 ${get("hour")}:${get("minute")} \u00b7 ${get("day")}.${get("month")}.${get("year")}`
      );
    };
    tick();
    const interval = setInterval(tick, 30000);
    return () => clearInterval(interval);
  }, []);

  // Tape peel: auto-hide after flung
  useEffect(() => {
    if (tapeState === "flung") {
      const timer = setTimeout(() => setTapeState("gone"), 550);
      return () => clearTimeout(timer);
    }
  }, [tapeState]);

  // Tape peel: photo drop animation
  useEffect(() => {
    if (tapeState === "peeled" && photoRef.current) {
      const photo = photoRef.current;
      const baseRot = parseFloat(photo.dataset.rot || "0");
      const flow = window.matchMedia("(max-width: 960px)").matches;
      if (!flow) {
        photo.animate(
          [
            { transform: `rotate(${baseRot}deg) translateY(0)` },
            { transform: `rotate(${baseRot + 1.5}deg) translateY(6px)` },
            { transform: `rotate(${baseRot}deg) translateY(0)` },
          ],
          { duration: 500, easing: "cubic-bezier(.4,1.4,.4,1)" }
        );
      }
    }
  }, [tapeState]);

  const handleTapeClick = useCallback(
    (e: React.MouseEvent | React.KeyboardEvent) => {
      e.stopPropagation();
      setTapeState((prev) => {
        if (prev === "attached") return "peeled";
        if (prev === "peeled") return "flung";
        return prev;
      });
    },
    []
  );

  const handleReset = useCallback(() => {
    resetRef.current?.();
    setTapeState("attached");
  }, []);

  return (
    <>
      <main className="stage" ref={stageRef}>
        <div className="hint">
          kiszka.xyz
          <br />
          <span style={{ color: "#c0392b" }}>{"\u25CF"}</span> drag things
          around {"\u00b7"} click the tape
        </div>

        <section className="hero">
          <p className="eyebrow">
            <span className="live" aria-hidden="true" />
            building things that should exist
          </p>
          <h1 className="name">
            Antoni
            <br />
            Kiszka
            <span className="dot" aria-hidden="true">
              .
            </span>
          </h1>
          <p className="sub">
            Born in the Polish countryside, now in Warsaw. Started coding at 10
            and founded my first company at 17 &mdash; a software house, built
            with a high-school friend who&apos;s still my co-founder. Currently
            building <b>Derpetual</b>, trying to make every financial asset
            tradable. I find beauty in simplicity.
          </p>

          <nav className="links" aria-label="elsewhere">
            <a href="https://blog.kiszka.xyz">blog&nbsp;&rarr;</a>
            <a href="https://x.com/antoni_kiszka">x&nbsp;&rarr;</a>
            <a href="https://github.com/akiszka">github&nbsp;&rarr;</a>
            <a href="https://www.linkedin.com/in/antoni-kiszka/">
              linkedin&nbsp;&rarr;
            </a>
            <a href="mailto:site@kiszka.xyz">site@kiszka.xyz&nbsp;&rarr;</a>
          </nav>
        </section>

        {/* Floating desk objects — inline positions eliminate flash on load / back-nav */}
        <div className="mobile-stack">
          <article
            className={`obj photo${tapeState !== "attached" ? " peeled" : ""}`}
            data-px="680"
            data-py="30"
            data-rot="4"
            style={{
              left: 680,
              top: cssTop(30),
              transform: "rotate(4deg)",
            }}
            ref={photoRef as React.RefObject<HTMLElement>}
            aria-label="Polaroid photo from Oslo"
          >
            <span
              className={`tape${tapeState === "flung" ? " flung" : ""}`}
              role="button"
              tabIndex={0}
              aria-label="peel tape"
              onClick={handleTapeClick}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleTapeClick(e);
                }
              }}
              style={tapeState === "gone" ? { display: "none" } : undefined}
            />
            <div className="photo-inner">
              <Image
                src="/oslo.jpg"
                alt="Photo from Oslo"
                fill
                sizes="260px"
                loading="eager"
                className="object-cover select-auto pointer-events-none"
              />
            </div>
            <div className="photo-cap">hello from oslo</div>
          </article>

          <article
            className="obj card"
            data-px="750"
            data-py="310"
            data-rot="-2"
            style={{
              left: 750,
              top: cssTop(310),
              width: 240,
              transform: "rotate(-2deg)",
            }}
          >
            <h2>currently</h2>
            <p>
              <a href="https://www.derpetual.com/" target="_blank" rel="noreferrer noopener">
                <b>Derpetual</b>{" "}&mdash; making every financial asset tradable.&nbsp;&#x2197;
              </a>
            </p>
          </article>

          <article
            className="obj card"
            data-px="550"
            data-py="615"
            data-rot="2"
            style={{
              left: 550,
              top: cssTop(615),
              width: 290,
              transform: "rotate(2deg)",
            }}
          >
            <h2>shipped</h2>
            <p>
              <a href="https://parlour.dev" target="_blank" rel="noreferrer noopener">blockchain apps&nbsp;&#x2197;</a>
              <br />
              <a href="https://robohero.io/" target="_blank" rel="noreferrer noopener">games&nbsp;&#x2197;</a>
              <br />
              <a href="https://tofu.media/" target="_blank" rel="noreferrer noopener">media tech&nbsp;&#x2197;</a>
              <br />
              <a href="https://about.synergy.markets/" target="_blank" rel="noreferrer noopener">trading apps&nbsp;&#x2197;</a>
              <br />
              <a href="https://atlas.okinawa/" target="_blank" rel="noreferrer noopener">on-chain hft&nbsp;&#x2197;</a>
              <br />
              <a href="https://www.aldersonlabs.com/" target="_blank" rel="noreferrer noopener">business software&nbsp;&#x2197;</a>
            </p>
          </article>

          <article
            className="obj card"
            data-px="40"
            data-py="580"
            data-rot="-3"
            style={{
              left: 40,
              top: cssTop(580),
              width: 310,
              transform: "rotate(-3deg)",
            }}
          >
            <h2>interested in</h2>
            <p>
              useful defi {"\u00b7"} neuroscience {"\u00b7"} linguistics{" "}
              {"\u00b7"} privacy
            </p>
          </article>

          <article
            className="obj card dark"
            data-px="300"
            data-py="650"
            data-rot="3"
            style={{
              left: 300,
              top: cssTop(650),
              width: 240,
              transform: "rotate(3deg)",
            }}
          >
            <h2>belief</h2>
            <p
              style={{
                fontFamily: "var(--font-instrument-serif), serif",
                fontStyle: "italic",
                fontSize: 18,
                lineHeight: 1.35,
              }}
            >
              there is beauty in simplicity.
            </p>
          </article>

          <article
            className="obj card"
            data-px="740"
            data-py="450"
            data-rot="-1"
            style={{
              left: 740,
              top: cssTop(450),
              width: 320,
              transform: "rotate(-1deg)",
            }}
          >
            <h2>now reading</h2>
            <p>
              <em>Elon Musk</em> {"\u2014"} Isaacson
              <br />
              <em>The Brothers Karamazov</em> {"\u2014"} Dostoyevski
              <br />
              <em>The Family</em> {"\u2014"} Puzo
            </p>
          </article>
        </div>
      </main>

      <div className="foot">
        <span>{clockText}</span>
        <button
          className="reset"
          onClick={handleReset}
          title="reset the desk"
        >
          tidy desk {"\u21BA"}
        </button>
      </div>
    </>
  );
}
