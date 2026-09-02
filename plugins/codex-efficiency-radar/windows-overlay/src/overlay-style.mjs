export const OVERLAY_CSS = String.raw`
  [data-codex-efficiency-root] {
    --cer-border: color-mix(in srgb, currentColor 16%, transparent);
    --cer-border-strong: color-mix(in srgb, currentColor 28%, transparent);
    --cer-surface: color-mix(in srgb, Canvas 95%, currentColor 5%);
    --cer-surface-raised: color-mix(in srgb, Canvas 88%, currentColor 12%);
    --cer-hover: color-mix(in srgb, currentColor 7%, transparent);
    --cer-value: color-mix(in srgb, #d8a63c 76%, currentColor 24%);
    border-block-start: 1px solid var(--cer-border);
    box-sizing: border-box;
    color: inherit;
    flex: 0 0 auto;
    font: inherit;
    margin-block-start: 6px;
    padding: 6px 8px 8px;
    width: 100%;
  }
  [data-codex-efficiency-root],
  [data-codex-efficiency-root] * { box-sizing: border-box; }
  [role="menu"][data-codex-efficiency-expanded] {
    max-width: calc(100vw - 32px) !important;
    width: min(760px, calc(100vw - 32px)) !important;
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
    gap: 10px;
    justify-content: flex-start;
    min-height: 40px;
    padding: 8px 9px;
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
    border: 1px solid var(--cer-border-strong);
    border-radius: 7px;
    display: inline-flex;
    font-size: 13px;
    font-weight: 750;
    height: 25px;
    justify-content: center;
    width: 25px;
  }
  .codex-efficiency-entry-label {
    font-size: 13px;
    font-weight: 700;
    letter-spacing: .01em;
  }
  .codex-efficiency-entry-summary {
    font-size: 10px;
    margin-inline-start: auto;
    opacity: .66;
    white-space: nowrap;
  }
  .codex-efficiency-entry-chevron {
    display: inline-block;
    font-size: 15px;
    opacity: .68;
    transform: rotate(0deg);
    transition: transform 160ms ease;
  }
  [data-codex-efficiency-entry][aria-expanded="true"] .codex-efficiency-entry-chevron {
    transform: rotate(180deg);
  }
  [data-codex-efficiency-panel] {
    background: var(--cer-surface);
    border: 1px solid var(--cer-border);
    border-radius: 12px;
    box-shadow: 0 4px 18px color-mix(in srgb, currentColor 9%, transparent);
    margin-block-start: 7px;
    overflow: hidden;
  }
  [data-codex-efficiency-panel][hidden] { display: none !important; }
  .codex-efficiency-panel-heading {
    align-items: flex-start;
    display: flex;
    flex-wrap: wrap;
    gap: 6px 18px;
    justify-content: space-between;
    padding: 13px 14px 8px;
  }
  .codex-efficiency-panel-title { display: grid; gap: 2px; }
  .codex-efficiency-panel-title strong {
    font-size: 14px;
    font-weight: 750;
    letter-spacing: .01em;
  }
  .codex-efficiency-panel-title span,
  .codex-efficiency-panel-metrics {
    font-size: 10px;
    line-height: 1.45;
    opacity: .68;
  }
  .codex-efficiency-map-scroll {
    max-height: min(390px, 46vh);
    overflow: auto;
    overscroll-behavior: contain;
    padding: 4px 8px 8px;
    scrollbar-color: color-mix(in srgb, currentColor 32%, transparent) transparent;
  }
  [data-codex-efficiency-grid] {
    min-width: var(--cer-map-width, 680px);
  }
  .codex-efficiency-map-head,
  .codex-efficiency-map-row {
    display: grid;
    gap: 6px;
    grid-template-columns: var(--cer-map-columns);
  }
  .codex-efficiency-map-head {
    background: var(--cer-surface);
    inset-block-start: -4px;
    padding: 7px 6px 6px;
    position: sticky;
    z-index: 4;
  }
  .codex-efficiency-model-head,
  .codex-efficiency-effort-head {
    align-self: end;
    font-size: 10px;
    font-weight: 700;
    opacity: .68;
    padding: 0 7px;
  }
  .codex-efficiency-effort-head small {
    display: block;
    font-size: 8px;
    font-weight: 600;
    letter-spacing: .05em;
    margin-block-start: 1px;
    opacity: .62;
  }
  .codex-efficiency-map-row {
    background: color-mix(in srgb, currentColor 3%, transparent);
    border-radius: 11px;
    margin-block-end: 6px;
    padding: 6px;
    transition: background 120ms ease;
  }
  .codex-efficiency-map-row:hover {
    background: color-mix(in srgb, currentColor 5%, transparent);
  }
  .codex-efficiency-model-label {
    align-content: center;
    display: grid;
    font-size: 12px;
    font-weight: 750;
    line-height: 1.25;
    min-height: 68px;
    padding: 7px;
  }
  .codex-efficiency-model-label small {
    font-size: 9px;
    font-weight: 550;
    margin-block-start: 3px;
    opacity: .54;
  }
  [data-codex-efficiency-option] {
    appearance: none;
    background: color-mix(in srgb, currentColor 3%, transparent);
    border: 1px solid transparent;
    border-radius: 9px;
    color: inherit;
    cursor: pointer;
    display: grid;
    font: inherit;
    gap: 5px;
    min-height: 68px;
    padding: 7px 8px;
    position: relative;
    text-align: start;
    transition: background 120ms ease, border-color 120ms ease, transform 120ms ease;
  }
  [data-codex-efficiency-option]:hover {
    background: var(--cer-hover);
    border-color: var(--cer-border);
    transform: translateY(-1px);
  }
  [data-codex-efficiency-option]:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: 1px;
  }
  [data-codex-efficiency-option][data-value-pick="true"] {
    background: color-mix(in srgb, var(--cer-value) 12%, transparent);
    border-color: color-mix(in srgb, var(--cer-value) 56%, transparent);
  }
  [data-codex-efficiency-option][data-selected="true"] {
    box-shadow: inset 0 0 0 1px currentColor;
  }
  [data-codex-efficiency-option]:disabled {
    cursor: wait;
    opacity: .62;
    transform: none;
  }
  .codex-efficiency-option-badges {
    display: flex;
    gap: 4px;
    min-height: 15px;
  }
  .codex-efficiency-badge {
    align-items: center;
    border: 1px solid var(--cer-border);
    border-radius: 999px;
    display: none;
    font-size: 8px;
    font-weight: 750;
    letter-spacing: .03em;
    line-height: 1;
    padding: 3px 5px;
  }
  [data-codex-efficiency-option][data-value-pick="true"] .codex-efficiency-badge-value {
    border-color: color-mix(in srgb, var(--cer-value) 70%, transparent);
    display: inline-flex;
  }
  [data-codex-efficiency-option][data-selected="true"] .codex-efficiency-badge-current {
    display: inline-flex;
  }
  .codex-efficiency-score-pair {
    align-items: end;
    display: grid;
    gap: 5px;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .codex-efficiency-score {
    display: grid;
    gap: 1px;
    line-height: 1;
  }
  .codex-efficiency-score span {
    font-size: 8px;
    font-weight: 650;
    opacity: .58;
  }
  .codex-efficiency-score strong {
    font-size: 16px;
    font-variant-numeric: tabular-nums;
    font-weight: 760;
    letter-spacing: -.02em;
  }
  .codex-efficiency-score-software { opacity: .78; }
  .codex-efficiency-empty {
    align-items: center;
    display: flex;
    font-size: 13px;
    justify-content: center;
    min-height: 68px;
    opacity: .35;
  }
  .codex-efficiency-map-legend {
    align-items: center;
    border-block-start: 1px solid var(--cer-border);
    display: flex;
    font-size: 9px;
    gap: 6px;
    line-height: 1.45;
    opacity: .66;
    padding: 8px 12px;
  }
  .codex-efficiency-map-legend::before {
    background: var(--cer-value);
    border-radius: 999px;
    content: "";
    flex: 0 0 auto;
    height: 7px;
    width: 7px;
  }
  .codex-efficiency-panel-footer {
    align-items: center;
    border-block-start: 1px solid var(--cer-border);
    display: flex;
    flex-wrap: wrap;
    gap: 7px 10px;
    justify-content: space-between;
    padding: 10px 12px;
  }
  [data-codex-efficiency-status] {
    align-items: center;
    display: inline-flex;
    flex: 1 1 190px;
    font-size: 10px;
    gap: 6px;
    line-height: 1.45;
    min-width: 0;
    opacity: .68;
  }
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
    background: transparent;
    border: 1px solid var(--cer-border-strong);
    border-radius: 8px;
    color: inherit;
    cursor: pointer;
    flex: 0 0 auto;
    font: inherit;
    font-size: 10px;
    font-weight: 700;
    min-height: 34px;
    padding: 7px 11px;
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
`;
