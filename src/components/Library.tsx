import { useEffect, useMemo, useRef } from "react";
import type { Book, Note } from "../types";
import type { Spine } from "../engine/shelf";
import { buildSpines, packShelves, leanOffset } from "../engine/shelf";
import "../styles/Library.css";

/* The room is drawn at one fixed size and then scaled to cover the window.
   Drawing it responsively would mean recomputing the wall angles, the back wall
   width and the floor's trapezoid on every resize, for no gain: it is a picture
   of a room, and a picture may be scaled. */
const STAGE_WIDTH = 1000;
const STAGE_HEIGHT = 790;

/** Usable width inside the case, once its frame and padding are taken out. */
const SHELF_WIDTH = 400;

/* Cloth colours. Muted on purpose: the room has one lamp and a fire, and a
   saturated spine would read as lit from nowhere. */
const CLOTH = [
  "#6b4a3f",
  "#46564b",
  "#7a5a3c",
  "#54465a",
  "#3e4a58",
  "#6e4b46",
  "#575039",
  "#4a423c",
  "#5d3f3a",
  "#3f5250",
];

export interface LibraryProps {
  notes: Note[];
  books: Book[];
  /** A spine was chosen. Books carry their own id; a year carries "year:2014". */
  onOpenSpine: (spine: Spine) => void;
  onCreate: () => void;
}

/**
 * The archive as a room you can stand in.
 *
 * Every volume on the shelf is as thick as it deserves to be, so the shape of
 * fifteen years is visible before anything is read: 2011 is fat, 2022 is a
 * single sheet, and the machine-written year is the widest thing in the room
 * and marked as such.
 */
export const Library = ({
  notes,
  books,
  onOpenSpine,
  onCreate,
}: LibraryProps) => {
  const stageRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLElement>(null);

  const spines = useMemo(() => buildSpines(notes, books), [notes, books]);
  const shelves = useMemo(() => packShelves(spines, SHELF_WIDTH), [spines]);

  const bookCount = books.length;
  const volumeCount = spines.filter((spine) => spine.kind === "year").length;

  useEffect(() => {
    const stage = stageRef.current;
    const root = rootRef.current;
    if (!stage || !root) return;
    /* Cover rather than contain. Taking the larger ratio means the room always
       overflows its panel, so the page behind it is never visible. Measured
       against the panel rather than the window, because the rail takes width
       the room does not have. */
    const fit = () => {
      const box = root.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) return;
      const scale = Math.max(
        box.width / STAGE_WIDTH,
        box.height / STAGE_HEIGHT,
      );
      stage.style.transform = `scale(${scale.toFixed(4)})`;
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  return (
    <section className="library" aria-labelledby="library-title" ref={rootRef}>
      <div className="hud">
        <h1 id="library-title">Library</h1>
        <p>
          {notes.length} notes · {volumeCount} yearly volumes · {bookCount}{" "}
          books
        </p>
        <button type="button" className="hud__new" onClick={onCreate}>
          New book
        </button>
      </div>
      <div className="vig" />
      <div className="viewport">
        <div className="stage" ref={stageRef}>
          <div className="space">
            <div className="ground"></div>
            <div className="wall back">
              <div className="case">
                {shelves.map((shelf, index) => {
                  const slide = leanOffset(shelf, SHELF_WIDTH);
                  return (
                    <div className="shelf" key={shelf[0]?.id ?? index}>
                      <div className="books">
                        {shelf.map((spine, position) => {
                          const leaning =
                            slide !== null && position === shelf.length - 1;
                          const className = [
                            "bk",
                            spine.kind === "year" ? "vol" : "",
                            spine.ai ? "ai" : "",
                            leaning ? "lean" : "",
                          ]
                            .filter(Boolean)
                            .join(" ");
                          const style = {
                            width: `${spine.width}px`,
                            height: `${spine.height}px`,
                            background: CLOTH[spine.tone],
                            color: CLOTH[spine.tone],
                            ...(leaning ? { "--dx": `${slide}px` } : {}),
                          } as React.CSSProperties;
                          const face = (
                            <>
                              <span aria-hidden="true">{spine.label}</span>
                              <span className="sr-only">
                                {spine.label}, {spine.count}{" "}
                                {spine.count === 1 ? "note" : "notes"}
                                {spine.ai ? ", machine written" : ""}
                              </span>
                            </>
                          );
                          /* Only books have somewhere to open yet. A year
                               stays a plain element rather than a button that
                               takes the click and does nothing with it. */
                          return spine.kind === "book" ? (
                            <button
                              key={spine.id}
                              type="button"
                              className={className}
                              style={style}
                              onClick={() => onOpenSpine(spine)}
                            >
                              {face}
                            </button>
                          ) : (
                            <div
                              key={spine.id}
                              className={className}
                              style={style}
                            >
                              {face}
                            </div>
                          );
                        })}
                      </div>
                      <div className="board" />
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="lamp">
              <div className="glow"></div>
              <svg width="92" height="316" viewBox="0 0 92 316" fill="none">
                <ellipse
                  cx="46"
                  cy="308"
                  rx="32"
                  ry="7"
                  fill="#000"
                  opacity=".55"
                />
                <path d="M40 306h12V78H40z" fill="#3a2c1c" />
                <ellipse cx="46" cy="306" rx="24" ry="6" fill="#4a3823" />
                <path d="M17 76h58l-11-52H28z" fill="#8a6a3e" />
                <path d="M17 76h58l-11-52H28z" fill="url(#lg)" />
                <ellipse
                  cx="46"
                  cy="76"
                  rx="29"
                  ry="5.5"
                  fill="#ffd79a"
                  opacity=".85"
                />
                <defs>
                  <linearGradient id="lg" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0" stopColor="#fff" stopOpacity=".34" />
                    <stop offset=".45" stopColor="#fff" stopOpacity=".06" />
                    <stop offset="1" stopColor="#000" stopOpacity=".3" />
                  </linearGradient>
                  <filter
                    id="soft"
                    x="-40%"
                    y="-25%"
                    width="180%"
                    height="150%"
                  >
                    <feGaussianBlur stdDeviation="4.5" />
                  </filter>
                </defs>
              </svg>
            </div>
            <div className="cat">
              <svg width="140" height="88" viewBox="0 0 140 88" fill="none">
                <defs>
                  <linearGradient id="fur" x1="0.15" y1="0" x2="0.7" y2="1">
                    <stop offset="0" stopColor="#a68d72" />
                    <stop offset=".5" stopColor="#83705c" />
                    <stop offset="1" stopColor="#574a3e" />
                  </linearGradient>
                  <filter
                    id="soft"
                    x="-40%"
                    y="-25%"
                    width="180%"
                    height="150%"
                  >
                    <feGaussianBlur stdDeviation="4.5" />
                  </filter>
                </defs>
                <ellipse
                  cx="70"
                  cy="77"
                  rx="54"
                  ry="7"
                  fill="#000"
                  opacity=".42"
                />
                <g className="breath">
                  <path
                    d="M107 57c8 9 1 19-13 19H54"
                    stroke="url(#fur)"
                    strokeWidth="10"
                    strokeLinecap="round"
                    fill="none"
                  />
                  <ellipse cx="70" cy="51" rx="44" ry="23" fill="url(#fur)" />
                  <path d="M21 44L22 25L36 36Z" fill="url(#fur)" />
                  <path d="M38 36L47 21L53 41Z" fill="url(#fur)" />
                  <circle cx="36" cy="53" r="18" fill="url(#fur)" />
                  <path
                    d="M23 53q6 6 12 0"
                    stroke="#463a30"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    fill="none"
                    opacity=".6"
                  />
                </g>
              </svg>
            </div>
            <div className="table">
              <svg width="196" height="196" viewBox="0 -20 196 196" fill="none">
                <ellipse
                  cx="98"
                  cy="168"
                  rx="76"
                  ry="9"
                  fill="#000"
                  opacity=".5"
                />
                <path
                  d="M34 62l-16 104h11l20-104zM162 62l16 104h-11l-20-104z"
                  fill="#3b2c1c"
                />
                <path
                  d="M62 62l-6 104h10l6-104zM134 62l6 104h-10l-6-104z"
                  fill="#332618"
                />
                <ellipse cx="98" cy="58" rx="88" ry="15" fill="#6b4f30" />
                <ellipse cx="98" cy="55" rx="88" ry="15" fill="#8a6640" />
                <ellipse cx="98" cy="55" rx="88" ry="15" fill="url(#tg)" />
                <g transform="translate(-30.9,-14.4) scale(1.3)">
                  <g
                    fill="none"
                    stroke="#ffe6c0"
                    strokeWidth="3"
                    strokeLinecap="round"
                    opacity=".5"
                  >
                    <path className="st" d="M92 26c-5-6 5-10 0-17" />
                    <path className="st st2" d="M102 22c-5-6 5-11 0-18" />
                    <path className="st st3" d="M112 27c-4-6 5-10 1-16" />
                  </g>
                  <path
                    d="M120 40c7 0 11 4 11 8s-4 8-11 8"
                    stroke="#d9d2c4"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    d="M84 36h38v14a10 10 0 0 1-10 10H94a10 10 0 0 1-10-10z"
                    fill="#e4ddcf"
                  />
                  <path
                    d="M84 36h38v14a10 10 0 0 1-10 10H94a10 10 0 0 1-10-10z"
                    fill="url(#mg)"
                  />
                  <ellipse cx="103" cy="36" rx="19" ry="4.6" fill="#f2ece0" />
                  <ellipse
                    cx="103"
                    cy="36.4"
                    rx="14.6"
                    ry="3.2"
                    fill="#4a2f1c"
                  />
                </g>
                <defs>
                  <linearGradient id="tg" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0" stopColor="#fff" stopOpacity=".22" />
                    <stop offset=".5" stopColor="#fff" stopOpacity=".02" />
                    <stop offset="1" stopColor="#000" stopOpacity=".26" />
                  </linearGradient>
                  <linearGradient id="mg" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0" stopColor="#fff" stopOpacity=".3" />
                    <stop offset=".55" stopColor="#000" stopOpacity="0" />
                    <stop offset="1" stopColor="#000" stopOpacity=".28" />
                  </linearGradient>
                  <filter
                    id="soft"
                    x="-40%"
                    y="-25%"
                    width="180%"
                    height="150%"
                  >
                    <feGaussianBlur stdDeviation="4.5" />
                  </filter>
                </defs>
              </svg>
            </div>
            <div className="couch">
              <div className="cu-shadow"></div>
              <div className="cu-backrear"></div>
              <div className="cu-bendL"></div>
              <div className="cu-bendR"></div>
              <div className="cu-back">
                <div className="cush" style={{ left: "28px" }}></div>
                <div className="cush" style={{ left: "152px" }}></div>
              </div>
              <div className="cu-backtop"></div>
              <div className="cu-armLo"></div>
              <div className="cu-armRo"></div>
              <div className="cu-armLi"></div>
              <div className="cu-armRi"></div>
              <div className="cu-seat">
                <div className="cush" style={{ left: "28px" }}></div>
                <div className="cush" style={{ left: "152px" }}></div>
              </div>
              <div className="cu-apron"></div>
              <div className="cu-armLt"></div>
              <div className="cu-armRt"></div>
              <div className="cu-armLf"></div>
              <div className="cu-armRf"></div>
            </div>
            <div className="ceil"></div>
            <div className="wall left">
              <div className="fire">
                <svg width="300" height="360" viewBox="0 0 300 360" fill="none">
                  <defs>
                    <linearGradient id="stone" x1="0" y1="0" x2="1" y2="0.3">
                      <stop offset="0" stopColor="#584c41" />
                      <stop offset=".55" stopColor="#43392f" />
                      <stop offset="1" stopColor="#2c251e" />
                    </linearGradient>
                    <radialGradient id="fireglow" cx=".5" cy=".78" r=".6">
                      <stop offset="0" stopColor="#ffb055" stopOpacity=".9" />
                      <stop offset="1" stopColor="#ff7a20" stopOpacity="0" />
                    </radialGradient>
                    <filter
                      id="soft"
                      x="-40%"
                      y="-25%"
                      width="180%"
                      height="150%"
                    >
                      <feGaussianBlur stdDeviation="4.5" />
                    </filter>
                  </defs>
                  <rect
                    x="18"
                    y="66"
                    width="264"
                    height="286"
                    rx="4"
                    fill="url(#stone)"
                  />
                  <rect
                    x="4"
                    y="44"
                    width="292"
                    height="26"
                    rx="4"
                    fill="#5b432b"
                  />
                  <rect
                    x="4"
                    y="44"
                    width="292"
                    height="8"
                    rx="4"
                    fill="#7a5b3a"
                  />
                  <path d="M66 352V186a84 84 0 0 1 168 0v166z" fill="#0a0705" />
                  <rect
                    x="0"
                    y="336"
                    width="300"
                    height="24"
                    rx="3"
                    fill="#4b4036"
                  />
                  <ellipse
                    cx="150"
                    cy="296"
                    rx="138"
                    ry="92"
                    fill="url(#fireglow)"
                    className="emb"
                  />
                  <ellipse
                    cx="150"
                    cy="324"
                    rx="78"
                    ry="20"
                    fill="#ff8420"
                    opacity=".20"
                    className="emb"
                    style={{ animationDelay: "-1.2s" }}
                  />
                  <rect
                    x="96"
                    y="318"
                    width="108"
                    height="13"
                    rx="6"
                    fill="#2b1d12"
                  />
                  <rect
                    x="110"
                    y="304"
                    width="86"
                    height="13"
                    rx="6"
                    fill="#332315"
                    transform="rotate(-7 153 310)"
                  />
                  <ellipse
                    cx="150"
                    cy="326"
                    rx="52"
                    ry="9"
                    fill="#ff6a18"
                    opacity=".55"
                    className="emb"
                  />
                  <path
                    className="fl"
                    d="M91 330C91 298 92 272 99 254C104 249 111 258 120 284C129 305 129 322 129 330Z"
                    fill="#b8420d"
                    opacity="0.55"
                    filter="url(#soft)"
                    style={{
                      animationDuration: "1.45s",
                      animationDelay: "-0.00s",
                    }}
                  />
                  <path
                    className="fl"
                    d="M110 330C110 288 114 253 125 229C130 222 138 234 146 269C154 297 154 319 154 330Z"
                    fill="#b8420d"
                    opacity="0.55"
                    filter="url(#soft)"
                    style={{
                      animationDuration: "1.72s",
                      animationDelay: "-0.93s",
                    }}
                  />
                  <path
                    className="fl"
                    d="M129 330C129 281 135 242 150 214C156 206 165 220 171 260C177 292 177 317 177 330Z"
                    fill="#b8420d"
                    opacity="0.55"
                    filter="url(#soft)"
                    style={{
                      animationDuration: "1.99s",
                      animationDelay: "-1.86s",
                    }}
                  />
                  <path
                    className="fl"
                    d="M154 330C154 291 161 260 177 238C182 232 190 243 192 275C196 300 196 320 196 330Z"
                    fill="#b8420d"
                    opacity="0.55"
                    filter="url(#soft)"
                    style={{
                      animationDuration: "2.26s",
                      animationDelay: "-0.62s",
                    }}
                  />
                  <path
                    className="fl"
                    d="M177 330C177 301 185 277 201 260C206 255 213 264 212 288C213 307 213 322 213 330Z"
                    fill="#b8420d"
                    opacity="0.55"
                    filter="url(#soft)"
                    style={{
                      animationDuration: "2.53s",
                      animationDelay: "-1.55s",
                    }}
                  />
                  <path
                    className="fl"
                    d="M101 330C101 307 102 289 108 276C112 272 117 279 124 298C131 312 131 324 131 330Z"
                    fill="#ea7419"
                    opacity="0.8"
                    style={{
                      animationDuration: "2.26s",
                      animationDelay: "-1.55s",
                    }}
                  />
                  <path
                    className="fl"
                    d="M120 330C120 298 124 272 133 254C138 249 145 258 150 284C156 305 156 322 156 330Z"
                    fill="#ea7419"
                    opacity="0.8"
                    style={{
                      animationDuration: "2.53s",
                      animationDelay: "-0.31s",
                    }}
                  />
                  <path
                    className="fl"
                    d="M143 330C143 302 148 280 161 264C165 259 171 267 174 290C177 308 177 323 177 330Z"
                    fill="#ea7419"
                    opacity="0.8"
                    style={{
                      animationDuration: "1.45s",
                      animationDelay: "-1.24s",
                    }}
                  />
                  <path
                    className="fl"
                    d="M168 330C168 309 174 292 186 280C190 276 195 282 195 300C196 314 196 324 196 330Z"
                    fill="#ea7419"
                    opacity="0.8"
                    style={{
                      animationDuration: "1.72s",
                      animationDelay: "-0.00s",
                    }}
                  />
                  <path
                    className="fl"
                    d="M115 330C115 316 116 305 121 297C124 295 128 299 132 310C137 319 137 326 137 330Z"
                    fill="#ffa63d"
                    opacity="0.9"
                    style={{
                      animationDuration: "1.72s",
                      animationDelay: "-0.93s",
                    }}
                  />
                  <path
                    className="fl"
                    d="M136 330C136 311 139 296 147 285C151 282 155 287 159 303C162 315 162 325 162 330Z"
                    fill="#ffa63d"
                    opacity="0.9"
                    style={{
                      animationDuration: "1.99s",
                      animationDelay: "-1.86s",
                    }}
                  />
                  <path
                    className="fl"
                    d="M160 330C160 315 164 303 174 295C177 293 181 297 181 309C182 318 182 326 182 330Z"
                    fill="#ffa63d"
                    opacity="0.9"
                    style={{
                      animationDuration: "2.26s",
                      animationDelay: "-0.62s",
                    }}
                  />
                  <path
                    className="fl"
                    d="M131 330C131 322 132 315 136 310C138 309 141 311 144 318C147 323 147 328 147 330Z"
                    fill="#ffdc96"
                    opacity="0.95"
                    style={{
                      animationDuration: "2.53s",
                      animationDelay: "-0.31s",
                    }}
                  />
                  <path
                    className="fl"
                    d="M150 330C150 320 153 311 159 305C161 303 165 306 166 315C168 322 168 327 168 330Z"
                    fill="#ffdc96"
                    opacity="0.95"
                    style={{
                      animationDuration: "1.45s",
                      animationDelay: "-1.24s",
                    }}
                  />
                  <ellipse
                    cx="114"
                    cy="329"
                    rx="13"
                    ry="4"
                    fill="#ff5a10"
                    opacity="0.34"
                    className="emb"
                    style={{ animationDelay: "-0s" }}
                  />
                  <ellipse
                    cx="137"
                    cy="329"
                    rx="16"
                    ry="5"
                    fill="#ff7a1e"
                    opacity="0.42"
                    className="emb"
                    style={{ animationDelay: "-0.9s" }}
                  />
                  <ellipse
                    cx="163"
                    cy="329"
                    rx="14"
                    ry="4"
                    fill="#ff6a14"
                    opacity="0.36"
                    className="emb"
                    style={{ animationDelay: "-1.7s" }}
                  />
                  <ellipse
                    cx="187"
                    cy="329"
                    rx="11"
                    ry="3"
                    fill="#e0490c"
                    opacity="0.3"
                    className="emb"
                    style={{ animationDelay: "-2.4s" }}
                  />
                </svg>
              </div>
            </div>
            <div className="wall right" />
          </div>
        </div>
      </div>
    </section>
  );
};
