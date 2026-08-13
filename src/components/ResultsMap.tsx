"use client";

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import type { Origin, RankedVenue, SearchRequest } from "@/lib/types";
import { prefilterRadiusMeters } from "@/lib/geo/distance";

const STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    carto: {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png",
        "https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png",
        "https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png",
      ],
      tileSize: 256,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
    },
  },
  layers: [{ id: "carto", type: "raster", source: "carto" }],
};

const TRUST_COLOUR = {
  verified: "#0f7a52",
  likely: "#97620a",
  unverified: "#a03c3c",
} as const;

function circlePolygon(lat: number, lon: number, radiusMeters: number, steps = 96) {
  const coords: [number, number][] = [];
  const latRadius = radiusMeters / 111_320;
  const lonRadius = radiusMeters / (111_320 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= steps; i += 1) {
    const theta = (i / steps) * 2 * Math.PI;
    coords.push([lon + lonRadius * Math.cos(theta), lat + latRadius * Math.sin(theta)]);
  }
  return coords;
}

export function ResultsMap({
  origin,
  request,
  results,
  selectedSlug,
  onSelect,
}: {
  origin: Origin | null;
  request: SearchRequest;
  results: RankedVenue[];
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const markers = useRef<Map<string, Marker>>(new Map());
  const ready = useRef(false);

  useEffect(() => {
    if (!container.current || map.current) return;

    map.current = new maplibregl.Map({
      container: container.current,
      style: STYLE,
      center: [-73.9855, 40.758],
      zoom: 13,
      attributionControl: { compact: true },
    });
    const instance = map.current;
    instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    instance.on("load", () => {
      ready.current = true;
    });

    return () => {
      map.current?.remove();
      map.current = null;
      ready.current = false;
    };
  }, []);

  useEffect(() => {
    const instance = map.current;
    if (!instance || !origin) return;

    const radius = prefilterRadiusMeters(request.maxCommuteMinutes, request.travelMode);

    const draw = () => {
      const data: GeoJSON.Feature = {
        type: "Feature",
        properties: {},
        geometry: {
          type: "Polygon",
          coordinates: [circlePolygon(origin.lat, origin.lon, radius)],
        },
      };

      const existing = instance.getSource("commute-radius") as maplibregl.GeoJSONSource | undefined;
      if (existing) {
        existing.setData(data);
      } else {
        instance.addSource("commute-radius", { type: "geojson", data });
        instance.addLayer({
          id: "commute-radius-fill",
          type: "fill",
          source: "commute-radius",
          paint: { "fill-color": "#2a7bb0", "fill-opacity": 0.06 },
        });
        instance.addLayer({
          id: "commute-radius-line",
          type: "line",
          source: "commute-radius",
          paint: {
            "line-color": "#2a7bb0",
            "line-width": 1.2,
            "line-dasharray": [3, 3],
            "line-opacity": 0.5,
          },
        });
      }

      const marker = new maplibregl.Marker({ color: "#0b0f14", scale: 0.8 })
        .setLngLat([origin.lon, origin.lat])
        .addTo(instance);
      markers.current.get("__origin")?.remove();
      markers.current.set("__origin", marker);

      const bounds = new maplibregl.LngLatBounds();
      bounds.extend([origin.lon, origin.lat]);
      for (const result of results) bounds.extend([result.venue.lon, result.venue.lat]);
      instance.fitBounds(bounds, { padding: 56, maxZoom: 15.5, duration: 600 });
    };

    if (ready.current) draw();
    else instance.once("load", draw);
  }, [origin, request.maxCommuteMinutes, request.travelMode, results]);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;

    for (const [key, marker] of markers.current) {
      if (key !== "__origin") {
        marker.remove();
        markers.current.delete(key);
      }
    }

    results.forEach((result, index) => {
      const element = document.createElement("button");
      element.type = "button";
      element.setAttribute("aria-label", result.venue.name);
      element.className =
        "flex size-6 cursor-pointer items-center justify-center rounded-full text-[10px] font-bold text-white shadow-md ring-2 ring-white transition-transform";
      element.style.background = TRUST_COLOUR[result.trust];
      element.style.opacity = result.withinCommute ? "1" : "0.55";
      element.textContent = String(index + 1);
      element.addEventListener("click", (event) => {
        event.stopPropagation();
        onSelect(result.venue.slug);
      });

      const popup = new maplibregl.Popup({ offset: 14, closeButton: false }).setHTML(
        `<div style="padding:8px 10px;max-width:220px">
           <div style="font-size:13px;font-weight:600;color:#131a22">${escapeHtml(result.venue.name)}</div>
           <div style="font-size:11px;color:#64748b;margin-top:2px">${escapeHtml(result.fit.label)} · ${result.fit.capacity} cap</div>
           <div style="font-size:11px;color:#64748b">${Math.round(result.commute.durationMinutes)} min ${result.commute.mode === "walking" ? "walk" : "drive"}</div>
         </div>`,
      );

      const marker = new maplibregl.Marker({ element })
        .setLngLat([result.venue.lon, result.venue.lat])
        .setPopup(popup)
        .addTo(instance);

      markers.current.set(result.venue.slug, marker);
    });
  }, [results, onSelect]);

  useEffect(() => {
    for (const [slug, marker] of markers.current) {
      if (slug === "__origin") continue;
      const element = marker.getElement();
      const active = slug === selectedSlug;
      element.style.transform = `${element.style.transform.replace(/ scale\([^)]*\)/, "")}${active ? " scale(1.45)" : ""}`;
      element.style.zIndex = active ? "10" : "1";
    }

    if (selectedSlug && map.current) {
      const marker = markers.current.get(selectedSlug);
      if (marker) map.current.easeTo({ center: marker.getLngLat(), duration: 450 });
    }
  }, [selectedSlug]);

  return <div ref={container} className="h-full w-full" />;
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char,
  );
}
