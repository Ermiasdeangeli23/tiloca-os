"use client";

export function LeftControls() {
  return (
    <aside className="console-panel fixed bottom-0 left-0 top-14 z-20 w-[300px] border-r p-5">
      <div className="font-display text-lg font-semibold text-white">Controlli legacy</div>
      <p className="mt-3 text-sm leading-relaxed text-white/55">
        Questo componente è mantenuto solo per compatibilità storica. Il workflow ufficiale usa Delivery e Territori.
      </p>
    </aside>
  );
}
