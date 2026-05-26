"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FeatureCollection, Point, Polygon } from "geojson";
import mapboxgl from "mapbox-gl";

import { pointInPolygon, type LngLatTuple } from "@/lib/geo";
import type { RankedAsset, Territory } from "@/lib/types";

const EMPTY_FEATURE_COLLECTION: FeatureCollection<Point> = {
  type: "FeatureCollection",
  features: [],
};

const EMPTY_POLYGON_COLLECTION: FeatureCollection<Polygon> = {
  type: "FeatureCollection",
  features: [],
};

function suitabilityColor(value: string | null): string {
  if (value === "alta") return "#34d399";
  if (value === "media") return "#fbbf24";
  if (value === "bassa") return "#ef4444";
  return "#6b7280";
}

function darkerSuitabilityColor(value: string | null): string {
  if (value === "alta") return "#047857";
  if (value === "media") return "#b45309";
  if (value === "bassa") return "#991b1b";
  return "#374151";
}

function markerBaseSize(asset: RankedAsset): number {
  const capacity = asset.estimated_kwp || Math.round(asset.area_mq * 0.15);
  let size = 7;
  if (capacity >= 10000) size = 15;
  else if (capacity >= 6000) size = 13;
  else if (capacity >= 3000) size = 11;
  else if (capacity >= 1000) size = 9;

  if (asset.report_state === "qualified" || asset.report_state === "report_ready") {
    return Math.round(size * 1.3);
  }
  return size;
}

function markerRadiusExpression(selectedAssetId: number | null, hoveredAssetId: number | null): mapboxgl.Expression {
  const selectedId = selectedAssetId || -1;
  const hoveredId = hoveredAssetId || -1;
  return [
    "case",
    ["==", ["get", "id"], selectedId],
    ["+", ["get", "marker_size"], 4],
    ["==", ["get", "id"], hoveredId],
    ["+", ["get", "marker_size"], 3],
    ["get", "marker_size"],
  ] as mapboxgl.Expression;
}

function assetsToGeoJson(assets: RankedAsset[]): FeatureCollection<Point> {
  return {
    type: "FeatureCollection",
    features: assets.map((asset) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [asset.lon, asset.lat],
      },
      properties: {
        id: asset.id,
        rank: asset.rank,
        osm_id: asset.osm_id,
        name: asset.name || `OSM ${asset.osm_id}`,
        suitability: asset.suitability || "",
        color: suitabilityColor(asset.suitability),
        stroke_color: darkerSuitabilityColor(asset.suitability),
        area_mq: asset.area_mq,
        estimated_kwp: asset.estimated_kwp || 0,
        marker_size: markerBaseSize(asset),
      },
    })),
  };
}

type MapCanvasProps = {
  assets: RankedAsset[];
  selectedAssetId: number | null;
  selectedTerritory: Territory | null;
  onAssetSelect: (id: number) => void;
  onPolygonChange?: (polygon: LngLatTuple[] | null) => void;
  layout?: "console" | "full";
};

export function MapCanvas({
  assets,
  selectedAssetId,
  selectedTerritory,
  onAssetSelect,
  onPolygonChange,
  layout = "console",
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const loadedRef = useRef(false);
  const htmlMarkersRef = useRef<Map<number, mapboxgl.Marker>>(new Map());
  const assetsRef = useRef<RankedAsset[]>(assets);
  const geoJsonRef = useRef<FeatureCollection<Point>>(EMPTY_FEATURE_COLLECTION);
  const drawingRef = useRef(false);
  const draftCoordsRef = useRef<LngLatTuple[]>([]);
  const hoveredIdRef = useRef<number | null>(null);
  const selectedIdRef = useRef<number | null>(selectedAssetId);
  const pulseRef = useRef<number | null>(null);
  const pulseStepRef = useRef(0);
  const [isDrawing, setIsDrawing] = useState(false);
  const [draftCoords, setDraftCoords] = useState<LngLatTuple[]>([]);
  const [polygonCoords, setPolygonCoords] = useState<LngLatTuple[] | null>(null);
  const geoJson = useMemo(() => assetsToGeoJson(assets), [assets]);
  const selectedAsset = useMemo(
    () => assets.find((asset) => asset.id === selectedAssetId) || null,
    [assets, selectedAssetId]
  );
  const leftOverlayClass = layout === "full" ? "left-6" : "left-[320px]";
  const rightOverlayClass = layout === "full" ? "right-6" : "right-[430px]";
  const fitPadding = useMemo(
    () =>
      layout === "full"
        ? { left: 80, right: 80, top: 90, bottom: 80 }
        : { left: 340, right: 440, top: 100, bottom: 80 },
    [layout]
  );
  const polygonGeoJson = useMemo<FeatureCollection<Polygon>>(() => {
    const ring = polygonCoords || draftCoords;
    if (ring.length < 3) return EMPTY_POLYGON_COLLECTION;

    const closedRing = ring.length >= 3 ? [...ring, ring[0]] : ring;
    return {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [closedRing],
          },
          properties: {},
        },
      ],
    };
  }, [draftCoords, polygonCoords]);
  const areaStats = useMemo(() => {
    if (!polygonCoords) return null;
    const inside = assets.filter((asset) => pointInPolygon([asset.lon, asset.lat], polygonCoords));
    const noFvCount = inside.filter((asset) => {
      const metadata = asset.industrial_metadata || {};
      const rawValue = metadata.panels_present ?? metadata.has_panels ?? metadata.pv_present;
      return rawValue !== true && rawValue !== "true" && rawValue !== "yes";
    }).length;

    return {
      total: inside.length,
      alta: inside.filter((asset) => asset.suitability === "alta").length,
      media: inside.filter((asset) => asset.suitability === "media").length,
      bassa: inside.filter((asset) => asset.suitability === "bassa").length,
      noFv: noFvCount,
      totalKwp: inside
        .filter((asset) => asset.suitability !== "bassa")
        .reduce((sum, asset) => sum + (asset.estimated_kwp || 0), 0),
    };
  }, [assets, polygonCoords]);

  const updateDrawSource = useCallback(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const source = map.getSource("draw-area") as mapboxgl.GeoJSONSource | undefined;
    source?.setData(polygonGeoJson);
  }, [polygonGeoJson]);

  const finishArea = useCallback(() => {
    const nextPolygon = draftCoordsRef.current;
    if (nextPolygon.length < 3) return;
    drawingRef.current = false;
    setIsDrawing(false);
    setDraftCoords([]);
    setPolygonCoords(nextPolygon);
    onPolygonChange?.(nextPolygon);
    const map = mapRef.current;
    map?.doubleClickZoom.enable();
    if (map) map.getCanvas().style.cursor = "";
  }, [onPolygonChange]);

  const clearArea = useCallback(() => {
    drawingRef.current = false;
    draftCoordsRef.current = [];
    setIsDrawing(false);
    setDraftCoords([]);
    setPolygonCoords(null);
    onPolygonChange?.(null);
    const map = mapRef.current;
    map?.doubleClickZoom.enable();
    if (map) map.getCanvas().style.cursor = "";
  }, [onPolygonChange]);

  const startArea = useCallback(() => {
    draftCoordsRef.current = [];
    setPolygonCoords(null);
    setDraftCoords([]);
    onPolygonChange?.(null);
    drawingRef.current = true;
    setIsDrawing(true);
    const map = mapRef.current;
    map?.doubleClickZoom.disable();
    if (map) map.getCanvas().style.cursor = "crosshair";
  }, [onPolygonChange]);

  const renderHtmlMarkers = useCallback((nextAssets: RankedAsset[] = assetsRef.current) => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;

    htmlMarkersRef.current.forEach((marker) => marker.remove());
    htmlMarkersRef.current.clear();

    const currentAssets = nextAssets;
    const validAssets = currentAssets.filter(
      (asset) =>
        Number.isFinite(asset.lon) &&
        Number.isFinite(asset.lat) &&
        Math.abs(asset.lon) <= 180 &&
        Math.abs(asset.lat) <= 90
    );

    console.log("[Tiloca MapCanvas] marker render", {
      assetsCount: currentAssets.length,
      validAssetsCount: validAssets.length,
      firstAssetCoords: validAssets[0] ? { lon: validAssets[0].lon, lat: validAssets[0].lat } : null,
    });
    console.log("[Tiloca MapCanvas] map sources", Object.keys(map.getStyle().sources || {}));

    validAssets.forEach((asset) => {
      const size = Math.max(markerBaseSize(asset) * 2, 14);
      const color = suitabilityColor(asset.suitability) || "#34d399";
      const strokeColor = darkerSuitabilityColor(asset.suitability) || "#047857";
      const markerElement = document.createElement("button");
      markerElement.type = "button";
      markerElement.className = "tiloca-asset-marker";
      markerElement.textContent = String(asset.rank);
      markerElement.setAttribute("aria-label", asset.name || `Asset ${asset.id}`);
      markerElement.style.width = `${size}px`;
      markerElement.style.height = `${size}px`;
      markerElement.style.minWidth = `${size}px`;
      markerElement.style.minHeight = `${size}px`;
      markerElement.style.borderRadius = "9999px";
      markerElement.style.border = `${selectedAssetId === asset.id ? 2.5 : 1.5}px solid ${strokeColor}`;
      markerElement.style.background = color;
      markerElement.style.color = "#06130f";
      markerElement.style.display = "flex";
      markerElement.style.alignItems = "center";
      markerElement.style.justifyContent = "center";
      markerElement.style.fontFamily = "IBM Plex Mono, ui-monospace, monospace";
      markerElement.style.fontSize = "10px";
      markerElement.style.fontWeight = "700";
      markerElement.style.lineHeight = "1";
      markerElement.style.cursor = "crosshair";
      markerElement.style.boxShadow =
        asset.suitability === "alta"
          ? `0 0 0 4px ${color}22, 0 0 18px ${color}66`
          : `0 0 0 3px ${color}18, 0 0 12px ${color}44`;
      markerElement.style.transform = "scale(1)";
      markerElement.style.transition = "transform 120ms ease, box-shadow 120ms ease";

      markerElement.addEventListener("mouseenter", () => {
        markerElement.style.transform = "scale(1.18)";
      });
      markerElement.addEventListener("mouseleave", () => {
        markerElement.style.transform = "scale(1)";
      });
      markerElement.addEventListener("click", (event) => {
        event.stopPropagation();
        onAssetSelect(asset.id);
      });

      const marker = new mapboxgl.Marker({ element: markerElement, anchor: "center" })
        .setLngLat([asset.lon, asset.lat])
        .addTo(map);
      htmlMarkersRef.current.set(asset.id, marker);
    });
  }, [onAssetSelect, selectedAssetId]);

  useEffect(() => {
    selectedIdRef.current = selectedAssetId;
  }, [selectedAssetId]);

  useEffect(() => {
    assetsRef.current = assets;
    geoJsonRef.current = geoJson;
  }, [assets, geoJson]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) return;

    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: [10.33, 44.82],
      zoom: 8.2,
      pitch: 28,
      bearing: -8,
      attributionControl: false,
    });

    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ showCompass: true }), "top-right");
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right");

    map.on("load", () => {
      loadedRef.current = true;
      map.addSource("assets", {
        type: "geojson",
        data: EMPTY_FEATURE_COLLECTION,
        cluster: true,
        clusterMaxZoom: 11,
        clusterRadius: 42,
      });
      map.addLayer({
        id: "asset-clusters",
        type: "circle",
        source: "assets",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "rgba(0, 212, 160, 0.2)",
          "circle-stroke-color": "rgba(0, 212, 160, 0.72)",
          "circle-stroke-width": 1,
          "circle-radius": ["step", ["get", "point_count"], 18, 10, 24, 25, 30],
        },
      });

      map.addLayer({
        id: "asset-cluster-count",
        type: "symbol",
        source: "assets",
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
          "text-size": 11,
        },
        paint: {
          "text-color": "#d9fff4",
        },
      });

      map.addLayer({
        id: "asset-pin-pulse",
        type: "circle",
        source: "assets",
        filter: ["all", ["!", ["has", "point_count"]], ["==", ["get", "suitability"], "alta"]],
        paint: {
          "circle-color": "#34d399",
          "circle-opacity": 0.08,
          "circle-radius": ["+", ["get", "marker_size"], 14],
        },
      });

      map.addLayer({
        id: "asset-pin-halo",
        type: "circle",
        source: "assets",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": ["get", "color"],
          "circle-opacity": 0.2,
          "circle-radius": ["+", ["get", "marker_size"], 10],
        },
      });

      map.addLayer({
        id: "asset-pins",
        type: "circle",
        source: "assets",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": ["get", "color"],
          "circle-opacity": [
            "case",
            ["in", ["get", "suitability"], ["literal", ["nulla", "errore"]]],
            0.46,
            0.92,
          ],
          "circle-radius": markerRadiusExpression(null, null),
          "circle-stroke-color": ["get", "stroke_color"],
          "circle-stroke-width": [
            "case",
            ["==", ["get", "id"], -1],
            2,
            1,
          ],
        },
      });

      map.on("click", (event) => {
        if (!drawingRef.current) return;
        const nextDraft: LngLatTuple[] = [...draftCoordsRef.current, [event.lngLat.lng, event.lngLat.lat]];
        draftCoordsRef.current = nextDraft;
        setDraftCoords(nextDraft);
      });

      map.on("dblclick", (event) => {
        if (!drawingRef.current) return;
        event.preventDefault();
        finishArea();
      });

      map.addLayer({
        id: "asset-pin-ranks",
        type: "symbol",
        source: "assets",
        filter: ["!", ["has", "point_count"]],
        layout: {
          "text-field": ["to-string", ["get", "rank"]],
          "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
          "text-size": 10,
          "text-allow-overlap": true,
          "text-ignore-placement": true,
        },
        paint: {
          "text-color": "#06130f",
          "text-halo-color": "rgba(255,255,255,0.62)",
          "text-halo-width": 0.4,
        },
      });

      map.addSource("draw-area", {
        type: "geojson",
        data: EMPTY_POLYGON_COLLECTION,
      });

      map.addLayer({
        id: "draw-area-fill",
        type: "fill",
        source: "draw-area",
        paint: {
          "fill-color": "rgba(52, 211, 153, 0.16)",
          "fill-outline-color": "rgba(52, 211, 153, 0.5)",
        },
      });

      map.addLayer({
        id: "draw-area-line",
        type: "line",
        source: "draw-area",
        paint: {
          "line-color": "rgba(52, 211, 153, 0.9)",
          "line-width": 2,
          "line-dasharray": [1.5, 1],
        },
      });

      map.on("click", "asset-pins", (event) => {
        const feature = event.features?.[0];
        const id = Number(feature?.properties?.id);
        if (Number.isFinite(id)) onAssetSelect(id);
      });

      map.on("click", "asset-pin-ranks", (event) => {
        const feature = event.features?.[0];
        const id = Number(feature?.properties?.id);
        if (Number.isFinite(id)) onAssetSelect(id);
      });

      map.on("click", "asset-clusters", (event) => {
        const feature = event.features?.[0];
        const clusterId = feature?.properties?.cluster_id;
        const source = map.getSource("assets") as mapboxgl.GeoJSONSource | undefined;
        if (typeof clusterId !== "number") return;
        if (!source || !feature || !feature.geometry || feature.geometry.type !== "Point") return;

        const center = feature.geometry.coordinates as [number, number];
        const expansionZoom = (source as unknown as {
          getClusterExpansionZoom: (
            id: number,
            callback?: (error: Error | null, zoom: number) => void
          ) => Promise<number> | void;
        }).getClusterExpansionZoom(clusterId, (error, zoom) => {
          if (error || typeof zoom !== "number") return;
          map.easeTo({ center, zoom, pitch: 34, duration: 500 });
        });

        if (expansionZoom && typeof expansionZoom.then === "function") {
          expansionZoom.then((zoom) => {
            map.easeTo({ center, zoom, pitch: 34, duration: 500 });
          });
        }
      });

      map.on("mousemove", "asset-pins", (event) => {
        const id = Number(event.features?.[0]?.properties?.id);
        if (!Number.isFinite(id) || hoveredIdRef.current === id) return;
        hoveredIdRef.current = id;
        map.getCanvas().style.cursor = "crosshair";
        map.setPaintProperty(
          "asset-pins",
          "circle-radius",
          markerRadiusExpression(selectedIdRef.current, hoveredIdRef.current)
        );
      });
      map.on("mouseleave", "asset-pins", () => {
        hoveredIdRef.current = null;
        map.getCanvas().style.cursor = "";
        map.setPaintProperty(
          "asset-pins",
          "circle-radius",
          markerRadiusExpression(selectedIdRef.current, null)
        );
      });

      pulseRef.current = window.setInterval(() => {
        if (!map.getLayer("asset-pin-pulse")) return;
        pulseStepRef.current = (pulseStepRef.current + 1) % 60;
        const phase = pulseStepRef.current / 60;
        map.setPaintProperty("asset-pin-pulse", "circle-opacity", 0.05 + (1 - phase) * 0.12);
        map.setPaintProperty("asset-pin-pulse", "circle-radius", [
          "+",
          ["get", "marker_size"],
          10 + phase * 14,
        ]);
      }, 90);

      const source = map.getSource("assets") as mapboxgl.GeoJSONSource | undefined;
      source?.setData(geoJsonRef.current);
      renderHtmlMarkers();
      updateDrawSource();
    });

    return () => {
      if (pulseRef.current) window.clearInterval(pulseRef.current);
      htmlMarkersRef.current.forEach((marker) => marker.remove());
      htmlMarkersRef.current.clear();
      map.remove();
      mapRef.current = null;
      loadedRef.current = false;
    };
  }, [onAssetSelect]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const source = map.getSource("assets") as mapboxgl.GeoJSONSource | undefined;
    source?.setData(geoJson);
    renderHtmlMarkers(assets);
  }, [assets, geoJson, renderHtmlMarkers]);

  useEffect(() => {
    updateDrawSource();
  }, [updateDrawSource]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current || !assets.length || selectedAssetId) return;

    if (assets.length === 1) {
      map.flyTo({
        center: [assets[0].lon, assets[0].lat],
        zoom: 13.5,
        pitch: 35,
        duration: 700,
      });
      return;
    }

    const bounds = assets.reduce(
      (nextBounds, asset) => nextBounds.extend([asset.lon, asset.lat]),
      new mapboxgl.LngLatBounds([assets[0].lon, assets[0].lat], [assets[0].lon, assets[0].lat])
    );
    map.fitBounds(bounds, {
      padding: fitPadding,
      maxZoom: 13,
      duration: 700,
    });
  }, [assets, fitPadding, selectedAssetId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current || !selectedTerritory || assets.length) return;
    map.fitBounds(
      [
        [selectedTerritory.bbox_lon_min, selectedTerritory.bbox_lat_min],
        [selectedTerritory.bbox_lon_max, selectedTerritory.bbox_lat_max],
      ],
      { padding: fitPadding, duration: 700 }
    );
  }, [assets.length, fitPadding, selectedTerritory]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    if (selectedAsset) {
      map.flyTo({
        center: [selectedAsset.lon, selectedAsset.lat],
        zoom: Math.max(map.getZoom(), 14.2),
        pitch: 46,
        duration: 650,
      });
    }
    if (map.getLayer("asset-pins")) {
      map.setPaintProperty(
        "asset-pins",
        "circle-radius",
        markerRadiusExpression(selectedAssetId, hoveredIdRef.current)
      );
      map.setPaintProperty("asset-pins", "circle-stroke-width", [
        "case",
        ["==", ["get", "id"], selectedAssetId || -1],
        2.5,
        1,
      ]);
      map.setPaintProperty("asset-pin-halo", "circle-radius", [
        "case",
        ["==", ["get", "id"], selectedAssetId || -1],
        ["+", ["get", "marker_size"], 14],
        ["+", ["get", "marker_size"], 10],
      ]);
    }
  }, [selectedAsset, selectedAssetId]);

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="h-full w-full bg-[#080f1a]" />
      {!process.env.NEXT_PUBLIC_MAPBOX_TOKEN ? (
        <div className={`absolute ${leftOverlayClass} top-5 border border-red-400/30 bg-red-950/70 px-3 py-2 font-mono text-xs text-red-100`}>
          MAPBOX TOKEN MISSING
        </div>
      ) : null}
      <div className={`absolute ${rightOverlayClass} top-20 z-10 flex gap-2 font-mono text-[10px] uppercase tracking-[0.14em]`}>
        <button
          onClick={isDrawing ? finishArea : startArea}
          className="border border-tiloca-green/30 bg-[#080f1a]/85 px-3 py-2 text-tiloca-green backdrop-blur-md disabled:opacity-40"
          disabled={isDrawing && draftCoords.length < 3}
        >
          {isDrawing ? "Chiudi area" : "Disegna area"}
        </button>
        <button
          onClick={clearArea}
          className="border border-white/10 bg-[#080f1a]/85 px-3 py-2 text-white/55 backdrop-blur-md disabled:opacity-35"
          disabled={!polygonCoords && !isDrawing}
        >
          Pulisci area
        </button>
      </div>
      {isDrawing ? (
        <div className={`absolute ${rightOverlayClass} top-[126px] z-10 border border-white/10 bg-[#080f1a]/82 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-white/45 backdrop-blur-md`}>
          Clicca i punti in mappa. Chiudi con 3+ punti.
        </div>
      ) : null}
      {areaStats ? (
        <div className={`absolute ${leftOverlayClass} top-24 z-10 w-[210px] border border-tiloca-green/30 bg-[rgba(10,14,10,0.85)] p-3 font-mono text-[10px] uppercase tracking-[0.13em] text-white/58 backdrop-blur-md`}>
          <div className="mb-3 text-tiloca-green">Statistiche area</div>
          <AreaStat label="Totale" value={areaStats.total} />
          <AreaStat label="Alta" value={areaStats.alta} />
          <AreaStat label="Media" value={areaStats.media} />
          <AreaStat label="No-FV" value={areaStats.noFv} />
          <AreaStat label="Total kWp" value={Math.round(areaStats.totalKwp)} />
          <button
            onClick={clearArea}
            className="mt-3 w-full border border-white/10 px-2 py-2 text-left text-white/55 hover:border-tiloca-green/30 hover:text-tiloca-green"
          >
            Pulisci area
          </button>
        </div>
      ) : null}
      <div className={`absolute bottom-6 ${rightOverlayClass} z-10 w-[190px] border border-tiloca-green/30 bg-[rgba(10,14,10,0.85)] p-3 font-mono text-[10px] uppercase tracking-[0.13em] text-white/58 backdrop-blur-md`}>
        <div className="mb-3 text-tiloca-green">Idoneità</div>
        <LegendRow color="#34d399" label="alta" />
        <LegendRow color="#fbbf24" label="media" />
        <LegendRow color="#ef4444" label="bassa" />
        <LegendRow color="#6b7280" label="non analizzato" />
      </div>
    </div>
  );
}

function LegendRow({ color, label }: { color: string; label: string }) {
  return (
    <div className="mb-2 flex items-center justify-between last:mb-0">
      <span>{label}</span>
      <span className="h-2.5 w-2.5 rounded-full border border-black/40" style={{ backgroundColor: color }} />
    </div>
  );
}

function AreaStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="mb-2 flex items-center justify-between last:mb-0">
      <span>{label}</span>
      <span className="text-white/86">{new Intl.NumberFormat("it-IT").format(value)}</span>
    </div>
  );
}
