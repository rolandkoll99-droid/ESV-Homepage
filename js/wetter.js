/* =====================================================================
   ESV GREIN – Datum, Uhrzeit und Wetter
   Wetterdaten: Open-Meteo (kostenlos, ohne Anmeldung), alle 30 Minuten neu.
   Ohne Internet werden nur Datum und Uhrzeit angezeigt.
   ===================================================================== */
(function () {
  "use strict";

  var ICONS = {
    sonne: '<circle cx="12" cy="12" r="4.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/>',
    teilweise: '<path d="M8 3.5v1.5M3.5 8H5M4.8 4.8l1 1M11.2 4.8l-1 1"/><path d="M5.6 10.4A3.5 3.5 0 1 1 11 6.6"/><path d="M8 20h9a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.6A3.2 3.2 0 0 0 8 20z"/>',
    wolke: '<path d="M7 19h10a4.5 4.5 0 0 0 .5-9 6 6 0 0 0-11.6 1.8A3.6 3.6 0 0 0 7 19z"/>',
    nebel: '<path d="M7 13h10a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.6A3.2 3.2 0 0 0 7 13z"/><path d="M4 17h16M6 21h12"/>',
    regen: '<path d="M7 14h10a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.6A3.2 3.2 0 0 0 7 14z"/><path d="M8 17l-1 3M12 17l-1 3M16 17l-1 3"/>',
    schnee: '<path d="M7 14h10a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.6A3.2 3.2 0 0 0 7 14z"/><path d="M8 18v.01M12 18v.01M16 18v.01M10 21v.01M14 21v.01" stroke-width="2.6"/>',
    gewitter: '<path d="M7 14h10a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.6A3.2 3.2 0 0 0 7 14z"/><path d="M12.5 14l-2.5 4h3l-2 4"/>'
  };

  // WMO-Wettercodes -> Text + Symbol
  function wetterText(code) {
    var c = +code;
    if (c === 0) return ["Klar", "sonne"];
    if (c === 1) return ["Überwiegend klar", "sonne"];
    if (c === 2) return ["Teilweise bewölkt", "teilweise"];
    if (c === 3) return ["Bedeckt", "wolke"];
    if (c === 45 || c === 48) return ["Nebel", "nebel"];
    if (c >= 51 && c <= 57) return ["Nieselregen", "regen"];
    if (c >= 61 && c <= 67) return [c === 61 ? "Leichter Regen" : c === 65 ? "Starker Regen" : "Regen", "regen"];
    if (c >= 71 && c <= 77) return ["Schneefall", "schnee"];
    if (c >= 80 && c <= 82) return ["Regenschauer", "regen"];
    if (c === 85 || c === 86) return ["Schneeschauer", "schnee"];
    if (c >= 95) return ["Gewitter", "gewitter"];
    return ["–", "wolke"];
  }

  function icon(name, groesse) {
    var s = groesse || 22;
    // nur feste, eigene SVG-Teile – keine fremden Daten
    return '<svg aria-hidden="true" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + ICONS[name] + "</svg>";
  }

  function $(id) { return document.getElementById(id); }

  /* ---------- Uhr ---------- */
  function uhr() {
    var jetzt = new Date();
    var d = $("info-datum"), z = $("info-zeit");
    if (d) d.textContent = jetzt.toLocaleDateString("de-AT", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    if (z) z.textContent = jetzt.toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" }) + " Uhr";
  }

  /* ---------- Wetter ---------- */
  var ORT = { name: "Grein", lat: 48.229, lon: 14.856 };

  function wetterLaden() {
    if (!window.fetch) return;
    var url = "https://api.open-meteo.com/v1/forecast?latitude=" + ORT.lat + "&longitude=" + ORT.lon +
      "&current=temperature_2m,weather_code,wind_speed_10m" +
      "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max" +
      "&timezone=Europe%2FVienna&forecast_days=3";
    fetch(url).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(zeigen)
      .catch(function () {
        var t = $("info-wetter");
        if (t) t.textContent = "Wetter derzeit nicht verfügbar";
        var k = $("blick-wetter-inhalt");
        if (k) k.textContent = "Wetter derzeit nicht verfügbar (keine Internetverbindung).";
      });
  }

  function zeigen(w) {
    var c = w.current || {}, d = w.daily || {};
    var jetzt = wetterText(c.weather_code);
    var leiste = $("info-wetter");
    if (leiste) {
      leiste.innerHTML = icon(jetzt[1], 20);
      leiste.appendChild(document.createTextNode(" " + Math.round(c.temperature_2m) + " °C · " + jetzt[0] + " · " + ORT.name));
      leiste.title = "Wind " + Math.round(c.wind_speed_10m) + " km/h";
    }
    var kachel = $("blick-wetter-inhalt");
    if (kachel && d.time) {
      kachel.textContent = "";
      var namen = ["Heute", "Morgen", "Übermorgen"];
      d.time.forEach(function (tag, i) {
        var t = wetterText(d.weather_code[i]);
        var zeile = document.createElement("div");
        zeile.className = "wetter-tag";
        var sym = document.createElement("span");
        sym.className = "wetter-tag__icon";
        sym.innerHTML = icon(t[1], 26);
        var name = document.createElement("span");
        name.className = "wetter-tag__name";
        name.textContent = i < 3 ? namen[i] : tag;
        name.title = t[0];
        var temp = document.createElement("span");
        temp.className = "wetter-tag__temp";
        temp.textContent = Math.round(d.temperature_2m_max[i]) + "° / " + Math.round(d.temperature_2m_min[i]) + "°";
        var regen = document.createElement("span");
        regen.className = "wetter-tag__regen";
        var p = d.precipitation_probability_max ? d.precipitation_probability_max[i] : null;
        regen.textContent = p == null ? "" : p + " % Regen";
        zeile.appendChild(sym); zeile.appendChild(name); zeile.appendChild(temp); zeile.appendChild(regen);
        kachel.appendChild(zeile);
      });
      var titel = $("blick-wetter-titel");
      if (titel) titel.textContent = Math.round(c.temperature_2m) + " °C · " + jetzt[0];
    }
  }

  window.ESVWetter = function (verein) {
    verein = verein || {};
    var lat = parseFloat(verein.wetterLat), lon = parseFloat(verein.wetterLon);
    if (!isNaN(lat) && !isNaN(lon)) { ORT.lat = lat; ORT.lon = lon; }
    if (verein.wetterOrt) ORT.name = verein.wetterOrt;
    var ortLabel = $("blick-wetter-ort");
    if (ortLabel) ortLabel.textContent = "Wetter in " + ORT.name;
    wetterLaden();
    setInterval(wetterLaden, 30 * 60 * 1000);
  };

  uhr();
  setInterval(uhr, 1000);
})();
