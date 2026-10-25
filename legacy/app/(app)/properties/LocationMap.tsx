"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";
import { card, btnPrimary, btnSecondary } from "../../_lib/ui";
import { regeocode, setLocation, type PropertyFormState } from "./actions";

// 物件の位置を地図のピンで確かめる（設計書 7章）。地図は MapLibre GL＋国土地理院の淡色地図（出典を表示する）
// 住所検索がずれていたら、地図をクリックしてピンを置き直し「この位置で保存」

const NIIGATA: [number, number] = [139.0364, 37.9161];

export default function LocationMap({ propertyId, lon, lat, source, geocodedAt }: { propertyId: number; lon: number | null; lat: number | null; source: string | null; geocodedAt: string | null }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const marker = useRef<Marker | null>(null);
  const [picked, setPicked] = useState<[number, number] | null>(null);
  const [message, setMessage] = useState<PropertyFormState>({});
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let disposed = false;
    (async () => {
      const maplibregl = (await import("maplibre-gl")).default;
      if (disposed || !box.current) return;
      const center: [number, number] = lon !== null && lat !== null ? [lon, lat] : NIIGATA;
      const m = new maplibregl.Map({
        container: box.current,
        center,
        zoom: lon !== null ? 15 : 10,
        style: {
          version: 8,
          sources: {
            pale: {
              type: "raster",
              tiles: ["https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png"],
              tileSize: 256,
              maxzoom: 18,
              attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noreferrer">国土地理院</a>',
            },
          },
          layers: [{ id: "pale", type: "raster", source: "pale" }],
        },
      });
      m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      const mk = new maplibregl.Marker({ color: "#1f3a6d" });
      if (lon !== null && lat !== null) mk.setLngLat([lon, lat]).addTo(m);
      m.on("click", (e) => {
        mk.setLngLat(e.lngLat).addTo(m);
        setPicked([e.lngLat.lng, e.lngLat.lat]);
        setMessage({});
      });
      map.current = m;
      marker.current = mk;
    })();
    return () => {
      disposed = true;
      map.current?.remove();
      map.current = null;
    };
    // 位置が保存し直されたら（lon・lat が変わったら）地図を作り直す
  }, [lon, lat]);

  const save = () => {
    const position = picked ?? (lon !== null && lat !== null ? [lon, lat] : null);
    if (!position) return;
    startTransition(async () => {
      const r = await setLocation(propertyId, position[0], position[1]);
      setMessage(r);
      if (r.ok) setPicked(null);
    });
  };
  const retry = () =>
    startTransition(async () => {
      setPicked(null);
      setMessage(await regeocode(propertyId));
    });

  const sourceLabel = source === "manual" ? "地図で指定" : source ? "住所検索（国土地理院）" : null;

  return (
    <div className={`${card} p-5 grid gap-3`}>
      <div className="flex flex-wrap items-end gap-2">
        <div className="mr-auto">
          <div className="text-[15px] font-bold text-ink">物件の位置</div>
          <div className="text-[11px] text-muted mt-0.5">
            {lon !== null && lat !== null
              ? `緯度 ${lat.toFixed(6)}・経度 ${lon.toFixed(6)}（${sourceLabel ?? "取得元不明"}${geocodedAt ? `、${geocodedAt}` : ""}）。ずれていたら地図をクリックして置き直してください`
              : "位置がまだありません。地図をクリックしてピンを置くか、住所から取り直してください（位置がないと分析できません）"}
          </div>
        </div>
        <button type="button" onClick={retry} disabled={pending} className={`${btnSecondary} disabled:opacity-60`}>
          住所から位置を取り直す
        </button>
        <button type="button" onClick={save} disabled={pending || (!picked && (lon === null || lat === null))} className={`${btnPrimary} disabled:opacity-60`}>
          この位置で確定
        </button>
      </div>
      <div ref={box} className="h-[360px] rounded-md overflow-hidden border border-line" />
      {picked && <div className="text-xs text-body">置き直したピン：緯度 {picked[1].toFixed(6)}・経度 {picked[0].toFixed(6)}（まだ保存していません）</div>}
      {message.error && <div className="rounded-md border border-[#f3c4c4] bg-[#fdecec] px-3 py-2 text-xs text-[#b91c1c]">{message.error}</div>}
      {message.ok && <div className="rounded-md border border-[#bfe5c6] bg-[#e9f8ec] px-3 py-2 text-xs text-[#157347]">{message.ok}</div>}
      <div className="text-[11px] text-muted">地図：国土地理院 淡色地図。住所検索：国土地理院 地理院地図の住所検索</div>
    </div>
  );
}
