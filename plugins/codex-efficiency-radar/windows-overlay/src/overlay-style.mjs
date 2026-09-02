export const OVERLAY_CSS = String.raw`
  [data-codex-efficiency-root] {
    --cer-surface: color-mix(in srgb, Canvas 95%, currentColor 5%);
    --cer-hover: color-mix(in srgb, currentColor 7%, transparent);
    --cer-value: color-mix(in srgb, #d8a63c 76%, currentColor 24%);
    --cer-selected: color-mix(in srgb, #3b82f6 70%, currentColor 30%);
    box-sizing: border-box;
    color: inherit;
    flex: 0 0 auto;
    font: inherit;
    margin-block-start: 3px;
    padding: 3px 6px 5px;
    width: 100%;
  }
  [data-codex-efficiency-root],
  [data-codex-efficiency-root] * { box-sizing: border-box; }
  [role="menu"][data-codex-efficiency-expanded] {
    max-width: calc(100vw - 32px) !important;
    width: min(580px, calc(100vw - 32px)) !important;
  }
  [data-codex-efficiency-entry] {
    align-items: center;
    appearance: none;
    background: transparent;
    border: 0;
    border-radius: 8px;
    color: inherit;
    cursor: pointer;
    display: flex;
    font: inherit;
    gap: 7px;
    justify-content: flex-start;
    min-height: 32px;
    padding: 5px 7px;
    text-align: start;
    width: 100%;
  }
  [data-codex-efficiency-entry]:hover { background: var(--cer-hover); }
  [data-codex-efficiency-entry]:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: -2px;
  }
  .codex-efficiency-entry-icon {
    align-items: center;
    display: inline-flex;
    font-size: 11px;
    font-weight: 750;
    height: 18px;
    justify-content: center;
    opacity: .7;
    width: 18px;
  }
  .codex-efficiency-entry-label {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: .01em;
  }
  .codex-efficiency-entry-chevron {
    display: inline-block;
    font-size: 13px;
    margin-inline-start: auto;
    opacity: .68;
    transform: rotate(0deg);
    transition: transform 160ms ease;
  }
  [data-codex-efficiency-entry][aria-expanded="true"] .codex-efficiency-entry-chevron {
    transform: rotate(180deg);
  }
  [data-codex-efficiency-panel] {
    background: color-mix(in srgb, var(--cer-surface) 70%, transparent);
    border: 0;
    border-radius: 9px;
    box-shadow: none;
    margin-block-start: 3px;
    overflow: hidden;
  }
  [data-codex-efficiency-panel][hidden] { display: none !important; }
  .codex-efficiency-panel-heading {
    align-items: center;
    display: flex;
    justify-content: flex-end;
    min-height: 20px;
    padding: 5px 8px 1px;
  }
  .codex-efficiency-panel-metrics {
    font-size: 8px;
    line-height: 1.2;
    opacity: .48;
  }
  .codex-efficiency-map-scroll {
    max-height: min(286px, 34vh);
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 3px 6px 5px;
    scrollbar-color: color-mix(in srgb, currentColor 32%, transparent) transparent;
  }
  [data-codex-efficiency-grid] {
    display: grid;
    gap: 4px;
  }
  .codex-efficiency-map-row {
    background: color-mix(in srgb, currentColor 2.5%, transparent);
    border: 0;
    border-radius: 8px;
    padding: 6px;
    transition: background 120ms ease;
  }
  .codex-efficiency-map-row:hover {
    background: color-mix(in srgb, currentColor 5%, transparent);
  }
  .codex-efficiency-model-label {
    align-items: baseline;
    display: flex;
    font-size: 11px;
    font-weight: 750;
    line-height: 1.25;
    padding: 0 2px 5px;
  }
  .codex-efficiency-effort-list {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .codex-efficiency-option-cell {
    flex: 1 1 72px;
    max-width: 88px;
    min-width: 70px;
  }
  [data-codex-efficiency-option] {
    appearance: none;
    background: color-mix(in srgb, currentColor 3%, transparent);
    border: 0;
    border-radius: 7px;
    color: inherit;
    cursor: pointer;
    display: grid;
    font: inherit;
    gap: 3px;
    min-height: 46px;
    padding: 5px 6px;
    position: relative;
    text-align: start;
    transition: background 120ms ease, transform 120ms ease;
    width: 100%;
  }
  [data-codex-efficiency-option]:hover {
    background: var(--cer-hover);
    transform: translateY(-1px);
  }
  [data-codex-efficiency-option]:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: 1px;
  }
  [data-codex-efficiency-option][data-value-pick="true"] {
    background: color-mix(in srgb, var(--cer-value) 12%, transparent);
  }
  [data-codex-efficiency-option][data-selected="true"] {
    background: color-mix(in srgb, var(--cer-selected) 9%, transparent);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--cer-selected) 52%, transparent);
  }
  [data-codex-efficiency-option]:disabled {
    cursor: wait;
    opacity: .62;
    transform: none;
  }
  .codex-efficiency-option-head {
    align-items: center;
    display: flex;
    gap: 5px;
    justify-content: space-between;
  }
  .codex-efficiency-option-effort {
    display: flex;
    flex-direction: column;
    font-size: 9px;
    font-weight: 750;
    line-height: 1.05;
  }
  .codex-efficiency-option-badges {
    display: flex;
    gap: 2px;
    justify-content: flex-end;
  }
  .codex-efficiency-badge {
    align-items: center;
    border: 0;
    border-radius: 999px;
    display: none;
    font-size: 7px;
    font-weight: 750;
    height: 13px;
    justify-content: center;
    line-height: 1;
    padding: 0;
    width: 13px;
  }
  [data-codex-efficiency-option][data-value-pick="true"] .codex-efficiency-badge-value {
    background: color-mix(in srgb, var(--cer-value) 20%, transparent);
    color: color-mix(in srgb, var(--cer-value) 86%, currentColor 14%);
    display: inline-flex;
  }
  [data-codex-efficiency-option][data-selected="true"] .codex-efficiency-badge-current {
    background: color-mix(in srgb, var(--cer-selected) 15%, transparent);
    display: inline-flex;
  }
  .codex-efficiency-score-pair {
    align-items: baseline;
    display: flex;
    gap: 3px;
  }
  .codex-efficiency-score {
    font-size: 14px;
    font-variant-numeric: tabular-nums;
    font-weight: 760;
    letter-spacing: -.02em;
    line-height: 1;
  }
  .codex-efficiency-score-separator {
    font-size: 9px;
    opacity: .32;
  }
  .codex-efficiency-score-software { opacity: .78; }
  .codex-efficiency-panel-footer {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 5px 8px;
    justify-content: space-between;
    padding: 5px 7px 7px;
  }
  [data-codex-efficiency-status] {
    align-items: center;
    display: inline-flex;
    flex: 1 1 150px;
    font-size: 9px;
    gap: 5px;
    line-height: 1.3;
    min-width: 0;
    opacity: .68;
  }
  [data-codex-efficiency-status]:empty { display: none; }
  [data-codex-efficiency-status]::before {
    background: currentColor;
    border-radius: 999px;
    content: "";
    flex: 0 0 auto;
    height: 6px;
    opacity: .7;
    width: 6px;
  }
  [data-codex-efficiency-root][data-state="stale"] [data-codex-efficiency-status],
  [data-codex-efficiency-root][data-state="error"] [data-codex-efficiency-status],
  [data-codex-efficiency-root][data-state="selecting"] [data-codex-efficiency-status] {
    opacity: .94;
  }
  [data-codex-efficiency-refresh] {
    appearance: none;
    background: var(--cer-hover);
    border: 0;
    border-radius: 7px;
    color: inherit;
    cursor: pointer;
    flex: 0 0 auto;
    font: inherit;
    font-size: 9px;
    font-weight: 700;
    margin-inline-start: auto;
    min-height: 27px;
    padding: 4px 9px;
  }
  [data-codex-efficiency-refresh]:hover { background: var(--cer-hover); }
  [data-codex-efficiency-refresh]:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: 1px;
  }
  [data-codex-efficiency-refresh][data-loading="true"] {
    cursor: wait;
    opacity: .55;
  }
  @media (prefers-reduced-motion: reduce) {
    .codex-efficiency-entry-chevron,
    .codex-efficiency-map-row,
    [data-codex-efficiency-option] { transition: none; }
  }
  @media (max-width: 540px) {
    .codex-efficiency-option-cell {
      flex-basis: calc(50% - 3px);
      max-width: none;
    }
  }
`;
