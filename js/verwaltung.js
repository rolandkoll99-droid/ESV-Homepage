/* =====================================================================
   ESV GREIN – Verwaltung (PC-Version)
   Formulare für Termine, Ergebnisse, Veranstaltungen, Training,
   Fotos und Vereinsdaten. Speichert über server.py in data/daten.json.
   ===================================================================== */
(function () {
  "use strict";

  var TOKEN = "";
  var D = null; // aktuelle Daten
  var UNGESPEICHERT = false; // offenes Formular mit Eingaben?
  var AKTUELLER_REITER = "uebersicht";
  try { TOKEN = sessionStorage.getItem("esvToken") || ""; } catch (e) { /* ohne Speicher */ }

  /* ---------- Hilfen ---------- */
  function $(id) { return document.getElementById(id); }
  function el(tag, attrs, kinder) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v === undefined || v === null || v === false) return;
      if (k === "text") e.textContent = v;
      else if (k === "class") e.className = v;
      else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? "" : v);
    });
    (kinder || []).forEach(function (c) { if (c) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }
  function heuteISO() { var d = new Date(); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
  function datumDE(iso) { if (!iso) return ""; var p = iso.split("-"); return p[2] + "." + p[1] + "." + p[0]; }
  var WT = ["", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

  var toastUhr;
  function toast(text, fehler) {
    var t = $("toast");
    t.textContent = text;
    t.className = "toast zeigen" + (fehler ? " fehler" : "");
    clearTimeout(toastUhr);
    toastUhr = setTimeout(function () { t.className = "toast" + (fehler ? " fehler" : ""); }, fehler ? 5000 : 2200);
  }

  function toastMitAktion(text, knopfText, aktion) {
    var t = $("toast");
    t.textContent = text + " ";
    var k = el("button", { type: "button", class: "toast__knopf", text: knopfText });
    k.addEventListener("click", function () { t.className = "toast"; aktion(); });
    t.appendChild(k);
    t.className = "toast zeigen";
    clearTimeout(toastUhr);
    toastUhr = setTimeout(function () { t.className = "toast"; }, 8000);
  }

  function api(pfad, koerper, roh) {
    var opt = { method: koerper === undefined ? "GET" : "POST", headers: { "X-Token": TOKEN }, cache: "no-store" };
    if (koerper !== undefined) {
      opt.body = roh ? koerper : JSON.stringify(koerper);
      opt.headers["Content-Type"] = roh ? "application/octet-stream" : "application/json";
    }
    return fetch(pfad, opt).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok || j.ok === false) {
          if (r.status === 403 && j.ersteinrichtung) { zeigeErsteinrichtung(); }
          else if (r.status === 403 && pfad !== "api/admin/anmelden") abmelden(j.fehler || "Bitte neu anmelden.");
          var fehler = new Error(j.fehler || ("Fehler " + r.status));
          fehler.status = r.status;
          throw fehler;
        }
        return j;
      });
    });
  }

  function speichern(aenderung) {
    var paket = { _rev: D._rev, _aenderung: aenderung || "" };
    ["neuigkeiten", "termine", "ergebnisse", "veranstaltungen", "regelTraining", "trainingsfrei", "vorstand", "verein"].forEach(function (k) { paket[k] = D[k]; });
    return api("api/admin/speichern", paket)
      .then(function (j) { D._rev = j._rev; toast("Gespeichert ✓ " + j.gespeichert); return j; })
      .catch(function (e) {
        toast(e.message, true);
        if (e.status === 409) { // jemand anderer hat inzwischen gespeichert -> frisch laden
          datenLaden().then(function () { UNGESPEICHERT = false; reiterZeigen(AKTUELLER_REITER); });
        }
        throw e;
      });
  }

  function saisonAus(iso) {
    if (!iso) return "";
    var j = +iso.slice(0, 4), m = +iso.slice(5, 7);
    if (m >= 4 && m <= 9) return "Sommer " + j;
    if (m >= 10) return "Winter " + j + "/" + String(j + 1).slice(-2);
    return "Winter " + (j - 1) + "/" + String(j).slice(-2);
  }

  function bezeichnung(e) { return e.titel || e.bewerb || e.name || e.funktion || (e.datum ? datumDE(e.datum) : "") || "Eintrag"; }

  /* ---------- Bereiche mit Listen ---------- */
  var ARTEN = [["turnier", "Turnier"], ["meisterschaft", "Meisterschaft"], ["training", "Training (Sondertraining)"], ["fest", "Vereinsfest"]];
  var ARTNAME = { turnier: "Turnier", meisterschaft: "Meisterschaft", training: "Training", fest: "Vereinsfest" };

  function statusText(v) { return v ? "Entwurf" : "sichtbar"; }

  var BEREICHE = {
    neuigkeiten: {
      titel: "Neuigkeiten", neu: "Neue Neuigkeit", datumFeld: "datum",
      hinweis: "Erscheinen auf der Startseite ganz oben. Die 3 neuesten werden gezeigt. „Oben anheften“ hält eine wichtige Meldung vorne.",
      felder: [
        { k: "datum", l: "Datum", typ: "date", pflicht: true, standard: heuteISO },
        { k: "titel", l: "Überschrift", pflicht: true, platzhalter: "z. B. Start in die Wintersaison" },
        { k: "text", l: "Text", typ: "textarea", breit: true, platzhalter: "Was gibt es Neues?" },
        { k: "bild", l: "Bild (optional)", typ: "bild", breit: true },
        { k: "wichtig", l: "Oben anheften (wichtige Meldung)", typ: "checkbox", breit: true },
        { k: "entwurf", l: "Entwurf – noch nicht auf der Webseite zeigen", typ: "checkbox", breit: true }
      ],
      spalten: [["datum", "Datum", datumDE], ["titel", "Überschrift"], ["entwurf", "Status", statusText], ["wichtig", "Angeheftet", function (v) { return v ? "ja" : ""; }], ["bild", "Bild", function (v) { return v ? "ja" : ""; }]],
      sortierung: function (a, b) { return (b.datum || "").localeCompare(a.datum || ""); }
    },
    termine: {
      titel: "Termine", neu: "Neuer Termin", datumFeld: "datum", vergangenAusblenden: true,
      hinweis: "Turniere, Meisterschaften, Feste. An einem Tag mit Termin entfällt das Regeltraining automatisch.",
      felder: [
        { k: "datum", l: "Datum", typ: "date", pflicht: true },
        { k: "zeit", l: "Uhrzeit", typ: "time", hilfe: "leer lassen, wenn offen" },
        { k: "titel", l: "Bezeichnung", pflicht: true, platzhalter: "z. B. Bezirksmeisterschaft" },
        { k: "ort", l: "Ort", platzhalter: "z. B. Perg" },
        { k: "art", l: "Art", typ: "select", optionen: ARTEN },
        { k: "entwurf", l: "Entwurf – noch nicht auf der Webseite zeigen", typ: "checkbox", breit: true }
      ],
      spalten: [["datum", "Datum", datumDE], ["zeit", "Uhrzeit"], ["titel", "Bezeichnung"], ["ort", "Ort"], ["art", "Art", function (v) { return ARTNAME[v] || v; }], ["entwurf", "Status", statusText]],
      sortierung: function (a, b) { return (a.datum + (a.zeit || "")).localeCompare(b.datum + (b.zeit || "")); }
    },
    ergebnisse: {
      titel: "Ergebnisse", neu: "Neues Ergebnis", datumFeld: "datum",
      hinweis: "Das neueste Ergebnis erscheint automatisch auf der Startseite.",
      felder: [
        { k: "datum", l: "Datum", typ: "date", pflicht: true },
        { k: "bewerb", l: "Bewerb / Turnier", pflicht: true, platzhalter: "z. B. Mix Rechberg 2026" },
        { k: "ort", l: "Ort" },
        { k: "mannschaft", l: "Mannschaft", platzhalter: "z. B. ESV Grein 1" },
        { k: "platz", l: "Platz", typ: "number", pflicht: true, min: 1 },
        { k: "teilnehmer", l: "Anzahl Mannschaften", typ: "number", min: 1, hilfe: "optional" },
        { k: "punkte", l: "Punkte", platzhalter: "z. B. 14:4" },
        { k: "saison", l: "Saison", platzhalter: "wird automatisch ergänzt", liste: "saisonen", hilfe: "leer lassen = automatisch aus dem Datum (z. B. Winter 2026/27)" },
        { k: "pdf", l: "Ergebnisliste (Link oder Datei in „dokumente“)", breit: true, hilfe: "optional, z. B. dokumente/rechberg-2026.pdf" }
      ],
      spalten: [["datum", "Datum", datumDE], ["bewerb", "Bewerb"], ["mannschaft", "Mannschaft"], ["platz", "Platz", function (v, e) { return v + "." + (e.teilnehmer ? " von " + e.teilnehmer : ""); }], ["punkte", "Punkte"]],
      sortierung: function (a, b) { return b.datum.localeCompare(a.datum); }
    },
    veranstaltungen: {
      titel: "Veranstaltungen", neu: "Neue Veranstaltung", datumFeld: "datum", vergangenAusblenden: true,
      hinweis: "Größere Veranstaltungen mit Beschreibung, z. B. Ortsturnier oder Vereinsfest.",
      felder: [
        { k: "datum", l: "Datum", typ: "date", pflicht: true },
        { k: "titel", l: "Bezeichnung", pflicht: true },
        { k: "text", l: "Beschreibung", typ: "textarea", breit: true, platzhalter: "Wer kann mitmachen, Nenngeld, Ablauf …" },
        { k: "ausschreibung", l: "Ausschreibung (Link oder Datei in „dokumente“)", breit: true, hilfe: "optional" },
        { k: "entwurf", l: "Entwurf – noch nicht auf der Webseite zeigen", typ: "checkbox", breit: true }
      ],
      spalten: [["datum", "Datum", datumDE], ["titel", "Bezeichnung"], ["entwurf", "Status", statusText], ["text", "Beschreibung", function (v) { return (v || "").slice(0, 60) + ((v || "").length > 60 ? " …" : ""); }]],
      sortierung: function (a, b) { return a.datum.localeCompare(b.datum); }
    },
    regelTraining: {
      titel: "Training", neu: "Neuer Trainingstag",
      hinweis: "Diese Trainings stehen jede Woche automatisch im Kalender. Trainingsfreie Tage weiter unten.",
      felder: [
        { k: "wochentag", l: "Wochentag", typ: "select", zahl: true, pflicht: true, optionen: [1, 2, 3, 4, 5, 6, 7].map(function (n) { return [n, WT[n]]; }) },
        { k: "zeit", l: "Uhrzeit", typ: "time", hilfe: "leer lassen, wenn offen" },
        { k: "titel", l: "Bezeichnung", pflicht: true, platzhalter: "z. B. Seniorentraining" },
        { k: "ort", l: "Ort", platzhalter: "Stockbahn Grein" }
      ],
      spalten: [["wochentag", "Wochentag", function (v) { return WT[v]; }], ["zeit", "Uhrzeit"], ["titel", "Bezeichnung"], ["ort", "Ort"]],
      sortierung: function (a, b) { return a.wochentag - b.wochentag; }
    },
    trainingsfrei: {
      titel: "Trainingsfreie Tage", neu: "Trainingsfreien Tag hinzufügen", datumFeld: "datum", einfach: true, vergangenAusblenden: true,
      hinweis: "An diesen Tagen entfällt das Regeltraining (Feiertage, Bahn gesperrt …).",
      felder: [{ k: "datum", l: "Datum", typ: "date", pflicht: true }],
      spalten: [["datum", "Datum", function (v) { var d = new Date(v + "T12:00"); return d.toLocaleDateString("de-AT", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" }); }]],
      sortierung: function (a, b) { return a.datum.localeCompare(b.datum); }
    },
    vorstand: {
      titel: "Vorstand", neu: "Neue Funktion",
      hinweis: "Namen und Fotos nur mit Einverständnis der Personen veröffentlichen. Am besten ein Porträtfoto (Kopf und Schultern) – es wird rund zugeschnitten.",
      felder: [
        { k: "funktion", l: "Funktion", pflicht: true, platzhalter: "z. B. Obmann" },
        { k: "name", l: "Name", platzhalter: "Vor- und Nachname" },
        { k: "foto", l: "Foto (optional)", typ: "bild", breit: true, art: "vorstand", max: 600, rund: true }
      ],
      spalten: [["foto", "Foto", null, true], ["funktion", "Funktion"], ["name", "Name"]],
      sortierung: null
    }
  };

  function liste(schluessel) {
    var b = BEREICHE[schluessel];
    var roh = D[schluessel] || [];
    return b.einfach ? roh.map(function (s) { return { datum: s }; }) : roh;
  }
  function listeSetzen(schluessel, werte) {
    var b = BEREICHE[schluessel];
    D[schluessel] = b.einfach ? werte.map(function (o) { return o.datum; }) : werte;
  }

  function feldElement(f, wert) {
    var id = "f-" + f.k;
    var eingabe;
    if (f.typ === "checkbox") {
      eingabe = el("input", { id: id, type: "checkbox" });
      eingabe.checked = !!wert;
      return el("div", { class: "formular breit" }, [el("label", { class: "schalter", style: "font-size:16px;color:var(--blau)" }, [eingabe, f.l])]);
    }
    if (f.typ === "bild") {
      var pfad = el("input", { id: id, type: "hidden" }); pfad.value = wert || "";
      var vorschau = el("img", { class: "vorschaubild" + (f.rund ? " vorschaubild--rund" : ""), alt: "", src: wert || null, hidden: !wert });
      var datei = el("input", { type: "file", accept: "image/*", hidden: true });
      var status = el("p", { class: "fortschritt", role: "status" });
      var entfernen = el("button", { type: "button", class: "mini mini--weg", text: "Bild entfernen", hidden: !wert });
      datei.addEventListener("change", function () {
        if (!datei.files[0]) return;
        status.textContent = "Lade hoch …";
        bildVerkleinern(datei.files[0], f.max || 1600).then(function (blob) { return api("api/admin/bild?art=" + (f.art || "neuigkeit"), blob, true); })
          .then(function (j) { pfad.value = j.pfad; vorschau.src = j.pfad; vorschau.hidden = false; entfernen.hidden = false; status.textContent = "Bild bereit ✓"; })
          .catch(function (e) { status.textContent = "Fehler: " + e.message; });
      });
      entfernen.addEventListener("click", function () { pfad.value = ""; vorschau.hidden = true; entfernen.hidden = true; status.textContent = ""; });
      return el("div", { class: "formular breit" }, [el("label", { text: f.l }), vorschau, pfad, datei,
        el("div", { class: "editor__knoepfe", style: "margin-top:0" }, [
          el("button", { type: "button", class: "mini", style: "margin-left:0", text: "Bild auswählen …", onclick: function () { datei.click(); } }), entfernen]), status]);
    }
    if (f.typ === "select") {
      eingabe = el("select", { id: id });
      if (!f.pflicht) eingabe.appendChild(el("option", { value: "", text: "– bitte wählen –" }));
      f.optionen.forEach(function (o) {
        var opt = el("option", { value: String(o[0]), text: o[1] });
        if (String(wert) === String(o[0])) opt.selected = true;
        eingabe.appendChild(opt);
      });
    } else if (f.typ === "textarea") {
      eingabe = el("textarea", { id: id, placeholder: f.platzhalter });
      eingabe.value = wert || "";
    } else {
      eingabe = el("input", { id: id, type: f.typ || "text", placeholder: f.platzhalter, min: f.min, list: f.liste ? "dl-" + f.liste : null });
      eingabe.value = wert === null || wert === undefined ? "" : wert;
    }
    if (f.pflicht) eingabe.required = true;
    var box = el("div", { class: "formular" + (f.breit ? " breit" : "") }, [el("label", { for: id, text: f.l + (f.pflicht ? " *" : "") }), eingabe]);
    if (f.hilfe) box.appendChild(el("p", { class: "feld-hilfe", text: f.hilfe }));
    return box;
  }

  function zeigeListe(schluessel, ziel, sofortNeu) {
    var b = BEREICHE[schluessel];
    var bearbeiteIndex = sofortNeu ? -2 : -1;
    var ausblenden = !!b.vergangenAusblenden;

    function zeichnen() {
      ziel.textContent = "";
      var kopf = el("div", { class: "bereich-kopf" }, [el("h2", { text: b.titel })]);
      var neuKnopf = el("button", { type: "button", class: "knopf knopf--akzent", text: "+ " + b.neu, onclick: function () {
        if (UNGESPEICHERT && !window.confirm("Deine Eingaben im offenen Formular sind noch nicht gespeichert. Verwerfen?")) return;
        UNGESPEICHERT = false; bearbeiteIndex = -2; zeichnen(); } });
      kopf.appendChild(neuKnopf);
      ziel.appendChild(kopf);
      ziel.appendChild(el("p", { class: "bereich-hinweis", text: b.hinweis }));

      var eintraege = liste(schluessel).map(function (e, i) { return { e: e, i: i }; });
      if (bearbeiteIndex !== -1) ziel.appendChild(editor(bearbeiteIndex >= 0 ? eintraege[bearbeiteIndex].e : {}));

      if (b.sortierung) eintraege.sort(function (x, y) { return b.sortierung(x.e, y.e); });
      var heute = heuteISO();
      var vergangene = b.datumFeld ? eintraege.filter(function (x) { return x.e[b.datumFeld] < heute; }).length : 0;
      if (b.vergangenAusblenden && vergangene) {
        var cb = el("input", { type: "checkbox" }); cb.checked = ausblenden;
        cb.addEventListener("change", function () { ausblenden = cb.checked; zeichnen(); });
        ziel.appendChild(el("label", { class: "schalter" }, [cb, "Vergangene ausblenden (" + vergangene + ")"]));
      }

      var tabelle = el("table");
      var kopfzeile = el("tr");
      b.spalten.forEach(function (s) { kopfzeile.appendChild(el("th", { scope: "col", text: s[1] })); });
      kopfzeile.appendChild(el("th", { scope: "col" }, [el("span", { class: "sr", text: "Aktionen" })]));
      tabelle.appendChild(el("thead", null, [kopfzeile]));
      var tb = el("tbody");
      var sichtbar = 0;
      eintraege.forEach(function (x) {
        var vorbei = b.vergangenAusblenden && b.datumFeld && x.e[b.datumFeld] < heute;
        if (vorbei && ausblenden && b.vergangenAusblenden) return;
        sichtbar++;
        var tr = el("tr", { class: vorbei ? "vorbei" : null });
        b.spalten.forEach(function (s, si) {
          if (s[3]) { // Bildspalte
            tr.appendChild(el("td", { "data-label": s[1] }, [x.e[s[0]] ? el("img", { class: "mini-foto", src: x.e[s[0]], alt: "" }) : el("span", { class: "mini-foto mini-foto--leer", "aria-label": "kein Foto" })]));
            return;
          }
          var wert = s[2] ? s[2](x.e[s[0]], x.e) : (x.e[s[0]] == null ? "" : String(x.e[s[0]]));
          var td = el("td", { text: wert, "data-label": s[1], class: (s[0] === "entwurf" && x.e.entwurf) ? "ist-entwurf" : null });
          if (si === 0 && vorbei) td.appendChild(el("span", { class: "etikett", text: "vorbei" }));
          if (si === 0 && x.e.beispiel) td.appendChild(el("span", { class: "etikett etikett--beispiel", text: "Beispiel" }));
          tr.appendChild(td);
        });
        var loeschen = el("button", { type: "button", class: "mini mini--weg", text: "Löschen" });
        loeschen.addEventListener("click", function () {
          if (!loeschen.classList.contains("sicher")) {
            loeschen.classList.add("sicher"); loeschen.textContent = "Wirklich löschen?";
            setTimeout(function () { loeschen.classList.remove("sicher"); loeschen.textContent = "Löschen"; }, 4000);
            return;
          }
          var vorher = liste(schluessel).slice();
          var neu = vorher.slice(); neu.splice(x.i, 1); listeSetzen(schluessel, neu);
          var name = bezeichnung(x.e);
          bearbeiteIndex = -1; UNGESPEICHERT = false;
          speichern(b.titel + " gelöscht: " + name).then(function () {
            toastMitAktion("„" + name + "“ gelöscht.", "Rückgängig", function () {
              listeSetzen(schluessel, vorher);
              speichern(b.titel + " wiederhergestellt: " + name).then(zeichnen);
            });
          }).catch(function () { /* Meldung kommt aus speichern() */ });
          zeichnen();
        });
        tr.appendChild(el("td", { class: "aktionen" }, [
          el("button", { type: "button", class: "mini", text: "Bearbeiten", onclick: function () {
            if (UNGESPEICHERT && !window.confirm("Deine Eingaben im offenen Formular sind noch nicht gespeichert. Verwerfen?")) return;
            UNGESPEICHERT = false; bearbeiteIndex = x.i; zeichnen(); window.scrollTo({ top: 0, behavior: "smooth" }); } }),
          loeschen
        ]));
        tb.appendChild(tr);
      });
      if (!sichtbar) tb.appendChild(el("tr", null, [el("td", { colspan: String(b.spalten.length + 1), class: "leer", text: "Noch keine Einträge. Mit „+ " + b.neu + "“ anlegen." })]));
      tabelle.appendChild(tb);
      ziel.appendChild(el("div", { class: "karte eintraege" }, [tabelle]));

      if (schluessel === "regelTraining") {
        var frei = el("div", { style: "margin-top:40px" });
        ziel.appendChild(frei);
        zeigeListe("trainingsfrei", frei);
      }
    }

    function editor(wert) {
      var form = el("form", { class: "karte editor", novalidate: true });
      form.appendChild(el("h3", { text: bearbeiteIndex >= 0 ? "Eintrag bearbeiten" : b.neu }));
      var raster = el("div", { class: "editor__raster" });
      b.felder.forEach(function (f) {
        var w = wert[f.k];
        if (w === undefined && bearbeiteIndex === -2 && f.standard) w = f.standard();
        raster.appendChild(feldElement(f, w));
      });
      form.appendChild(raster);
      if (schluessel === "ergebnisse") {
        var dl = el("datalist", { id: "dl-saisonen" });
        (D.ergebnisse || []).map(function (e) { return e.saison; }).filter(function (s, i, a) { return s && a.indexOf(s) === i; })
          .forEach(function (s) { dl.appendChild(el("option", { value: s })); });
        form.appendChild(dl);
      }
      var meldung = el("p", { class: "meldung meldung--fehler", role: "alert", hidden: true });
      form.appendChild(meldung);
      form.appendChild(el("div", { class: "editor__knoepfe" }, [
        el("button", { type: "submit", class: "knopf knopf--dunkel", text: "Speichern" }),
        el("button", { type: "button", class: "knopf knopf--hell", text: "Abbrechen", onclick: function () { UNGESPEICHERT = false; bearbeiteIndex = -1; zeichnen(); } })
      ]));
      form.addEventListener("input", function () { UNGESPEICHERT = true; });
      form.addEventListener("change", function () { UNGESPEICHERT = true; });
      form.addEventListener("submit", function (ev) {
        ev.preventDefault();
        var neu = {}, fehlt = [];
        b.felder.forEach(function (f) {
          var feld = $("f-" + f.k);
          var v = f.typ === "checkbox" ? feld.checked : feld.value.trim();
          if (f.pflicht && !v) fehlt.push(f.l);
          if (f.typ === "number" || f.zahl) v = v === "" ? null : parseInt(v, 10);
          neu[f.k] = v;
        });
        if (fehlt.length) { meldung.textContent = "Bitte ausfüllen: " + fehlt.join(", "); meldung.hidden = false; $("f-" + b.felder.filter(function (f) { return fehlt.indexOf(f.l) >= 0; })[0].k).focus(); return; }
        if (schluessel === "termine" && !neu.art) neu.art = "turnier";
        if (schluessel === "ergebnisse" && !neu.saison) neu.saison = saisonAus(neu.datum);
        var alle = liste(schluessel).slice();
        var war = bearbeiteIndex >= 0;
        if (war) alle[bearbeiteIndex] = Object.assign({}, alle[bearbeiteIndex], neu); else alle.push(neu);
        listeSetzen(schluessel, alle);
        bearbeiteIndex = -1; UNGESPEICHERT = false;
        speichern(b.titel + (war ? " geändert: " : " neu: ") + bezeichnung(neu) + (neu.entwurf ? " (Entwurf)" : "")).catch(function () { /* Meldung kommt aus speichern() */ });
        zeichnen();
      });
      setTimeout(function () {
        // Cursor ins erste Feld – aber nur, wenn man nicht schon in einem Feld tippt
        if (form.contains(document.activeElement)) return;
        var erstes = form.querySelector("input,select,textarea"); if (erstes) erstes.focus();
      }, 30);
      return form;
    }
    zeichnen();
  }

  /* ---------- Fotos ---------- */
  function bildVerkleinern(datei, maxSeite, typ) {
    return createImageBitmap(datei).then(function (bmp) {
      var f = Math.min(1, maxSeite / Math.max(bmp.width, bmp.height));
      var c = document.createElement("canvas");
      c.width = Math.round(bmp.width * f); c.height = Math.round(bmp.height * f);
      c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
      return new Promise(function (ok) { c.toBlob(ok, typ || "image/jpeg", 0.86); });
    });
  }

  function fotosHochladen(dateien, ordner, status) {
    var liste = Array.prototype.slice.call(dateien), fertig = 0, fehler = [];
    function naechste() {
      if (!liste.length) {
        if (fertig) api("api/admin/protokoll", { text: fertig + " Foto(s) hinzugefügt: " + (ordner || "Allgemein") }).catch(function () { /* egal */ });
        status.textContent = fertig + " Foto(s) hinzugefügt" + (fehler.length ? ". Nicht möglich: " + fehler.join(", ") + " (Format nicht unterstützt, z. B. HEIC – am Handy „Kompatibel“/JPG einstellen)" : ".");
        return Promise.resolve();
      }
      var d = liste.shift();
      status.textContent = "Lade hoch … " + (fertig + 1) + " von " + (fertig + liste.length + 1 + fehler.length);
      return bildVerkleinern(d, 1920)
        .then(function (blob) {
          var name = d.name.replace(/\.[^.]+$/, "") + ".jpg";
          return api("api/admin/foto?ordner=" + encodeURIComponent(ordner) + "&name=" + encodeURIComponent(name), blob, true);
        })
        .then(function () { fertig++; }, function () { fehler.push(d.name); })
        .then(naechste);
    }
    return naechste();
  }

  function zeigeFotos(ziel) {
    ziel.textContent = "";
    var kopf = el("div", { class: "bereich-kopf" }, [el("h2", { text: "Fotos" }),
      STATUS.ordnerOeffnen ? el("button", { type: "button", class: "knopf knopf--hell", text: "Fotoordner öffnen", onclick: function () { api("api/admin/ordner-oeffnen", {}); } }) : null]);
    ziel.appendChild(kopf);
    ziel.appendChild(el("p", { class: "bereich-hinweis", text: "Ein Album pro Veranstaltung. Fotos hier hochladen ODER direkt in den Ordner „fotos“ auf dem Daten-Stick kopieren (ein Unterordner pro Veranstaltung, z. B. „2026-07-17 Mix Rechberg“). Große Handyfotos werden beim Hochladen automatisch verkleinert." }));

    var name = el("input", { id: "album-name", type: "text", placeholder: "z. B. Bezirksmeisterschaft" });
    var datum = el("input", { id: "album-datum", type: "date" }); datum.value = heuteISO();
    var neuForm = el("form", { class: "karte album-neu" }, [
      el("h3", { text: "Neues Album" }),
      el("div", { class: "editor__raster" }, [
        el("div", { class: "formular" }, [el("label", { for: "album-datum", text: "Datum der Veranstaltung" }), datum]),
        el("div", { class: "formular" }, [el("label", { for: "album-name", text: "Name" }), name]),
        el("div", { class: "formular" }, [el("button", { type: "submit", class: "knopf knopf--akzent", text: "Album anlegen" })])
      ])
    ]);
    neuForm.addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (!name.value.trim()) { name.focus(); toast("Bitte einen Namen eingeben", true); return; }
      api("api/admin/album", { name: name.value.trim(), datum: datum.value }).then(function () { toast("Album angelegt ✓"); zeigeFotos(ziel); })
        .catch(function (e) { toast(e.message, true); });
    });
    ziel.appendChild(neuForm);

    var listeBox = el("div", null, [el("p", { class: "leise", text: "Lade Alben …" })]);
    ziel.appendChild(listeBox);
    api("api/admin/alben").then(function (j) {
      listeBox.textContent = "";
      var alben = j.alben.sort(function (a, b) { return (b.datum || "").localeCompare(a.datum || ""); });
      if (!alben.length) listeBox.appendChild(el("p", { class: "leise", text: "Noch keine Alben vorhanden." }));
      alben.forEach(function (a) {
        var box = el("article", { class: "karte album-box" });
        var datei = el("input", { type: "file", accept: "image/*", multiple: true, hidden: true });
        var status = el("p", { class: "fortschritt", role: "status" });
        datei.addEventListener("change", function () {
          if (!datei.files.length) return;
          fotosHochladen(datei.files, a.ordner, status).then(function () { setTimeout(function () { zeigeFotos(ziel); }, 1200); });
        });
        var weg = el("button", { type: "button", class: "mini mini--weg", text: "Album löschen" });
        weg.addEventListener("click", function () {
          if (!weg.classList.contains("sicher")) { weg.classList.add("sicher"); weg.textContent = "Wirklich löschen?"; setTimeout(function () { weg.classList.remove("sicher"); weg.textContent = "Album löschen"; }, 4000); return; }
          api("api/admin/foto-loeschen", { ordner: a.ordner, datei: "" }).then(function () { toast("Album in den Papierkorb verschoben"); zeigeFotos(ziel); });
        });
        box.appendChild(el("div", { class: "album-box__kopf" }, [
          el("div", null, [el("h3", { text: a.album }), el("span", { class: "leise", text: (a.datum ? datumDE(a.datum) + " · " : "") + a.bilder.length + " Fotos" })]),
          el("div", { class: "album-box__knoepfe" }, [
            el("button", { type: "button", class: "knopf knopf--dunkel", text: "+ Fotos hinzufügen", onclick: function () { datei.click(); } }),
            a.ordner && STATUS.ordnerOeffnen ? el("button", { type: "button", class: "mini", text: "Ordner öffnen", onclick: function () { api("api/admin/ordner-oeffnen?ordner=" + encodeURIComponent(a.ordner), {}); } }) : null,
            a.ordner ? weg : null
          ])
        ]));
        box.appendChild(datei);
        box.appendChild(status);
        var daumen = el("div", { class: "daumen" });
        a.bilder.forEach(function (b) {
          var url = "fotos/" + (a.ordner ? encodeURIComponent(a.ordner) + "/" : "") + encodeURIComponent(b);
          var text = el("input", { type: "text", placeholder: "Beschreibung …", "aria-label": "Beschreibung zu " + b });
          text.value = (a.texte || {})[b] || "";
          text.addEventListener("change", function () {
            api("api/admin/fototext", { ordner: a.ordner, datei: b, text: text.value }).then(function () { toast("Beschreibung gespeichert ✓"); });
          });
          var x = el("button", { type: "button", class: "weg", "aria-label": "Foto löschen", text: "×" });
          x.addEventListener("click", function () {
            if (!x.dataset.sicher) { x.dataset.sicher = "1"; x.textContent = "?"; setTimeout(function () { delete x.dataset.sicher; x.textContent = "×"; }, 3000); return; }
            api("api/admin/foto-loeschen", { ordner: a.ordner, datei: b }).then(function () { fig.remove(); toast("Foto in den Papierkorb verschoben"); });
          });
          var fig = el("figure", null, [el("img", { src: url, alt: "", loading: "lazy" }), x, text]);
          daumen.appendChild(fig);
        });
        box.appendChild(daumen);
        listeBox.appendChild(box);
      });
    }).catch(function (e) { listeBox.textContent = "Fehler: " + e.message; });
  }

  /* ---------- Verein ---------- */
  var VEREINSFELDER = [
    { k: "adresse", l: "Adresse der Stockbahn", platzhalter: "Straße Hausnummer" },
    { k: "plzOrt", l: "PLZ Ort" },
    { k: "telefon", l: "Telefon (Kontakt)" },
    { k: "email", l: "E-Mail", typ: "email" },
    { k: "mitgliedsbeitrag", l: "Mitgliedsbeitrag", platzhalter: "z. B. 60 € pro Jahr" },
    { k: "trainingszeiten", l: "Trainingszeiten (Text)", hilfe: "leer lassen = automatisch aus „Training“" },
    { k: "facebook", l: "Link zur Facebook-Seite", breit: true },
    { k: "wetterOrt", l: "Wetter: Ortsname", platzhalter: "Grein" },
    { k: "wetterLat", l: "Wetter: Breitengrad", typ: "number", hilfe: "Grein: 48.229" },
    { k: "wetterLon", l: "Wetter: Längengrad", typ: "number", hilfe: "Grein: 14.856" }
  ];

  function bildUpload(art, titel, vorschauSrc, typ, maxSeite) {
    var datei = el("input", { type: "file", accept: "image/*", hidden: true });
    var img = el("img", { class: "vorschaubild", src: vorschauSrc + "?" + Date.now(), alt: titel });
    img.addEventListener("error", function () { img.hidden = true; });
    var status = el("p", { class: "fortschritt", role: "status" });
    datei.addEventListener("change", function () {
      if (!datei.files[0]) return;
      status.textContent = "Lade hoch …";
      bildVerkleinern(datei.files[0], maxSeite, typ)
        .then(function (blob) { return api("api/admin/bild?art=" + art, blob, true); })
        .then(function () { status.textContent = "Gespeichert ✓"; img.hidden = false; img.src = vorschauSrc + "?" + Date.now(); })
        .catch(function (e) { status.textContent = "Fehler: " + e.message; });
    });
    return el("div", { class: "karte", style: "padding:20px" }, [
      el("h3", { text: titel }), img, datei,
      el("button", { type: "button", class: "knopf knopf--dunkel", text: "Bild auswählen …", onclick: function () { datei.click(); } }), status
    ]);
  }

  function zeigeVerein(ziel) {
    ziel.textContent = "";
    ziel.appendChild(el("div", { class: "bereich-kopf" }, [el("h2", { text: "Verein" })]));
    ziel.appendChild(el("p", { class: "bereich-hinweis", text: "Kontaktdaten, Mitgliedsbeitrag und Bilder der Startseite." }));
    var form = el("form", { class: "karte editor", style: "border-color:transparent" });
    var raster = el("div", { class: "editor__raster" });
    VEREINSFELDER.forEach(function (f) { raster.appendChild(feldElement(f, D.verein[f.k])); });
    form.appendChild(raster);
    form.appendChild(el("div", { class: "editor__knoepfe" }, [el("button", { type: "submit", class: "knopf knopf--dunkel", text: "Speichern" })]));
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      VEREINSFELDER.forEach(function (f) {
        var v = $("f-" + f.k).value.trim();
        D.verein[f.k] = f.typ === "number" ? (v === "" ? "" : parseFloat(v)) : v;
      });
      speichern("Vereinsdaten geändert").catch(function () { /* Meldung kommt aus speichern() */ });
    });
    ziel.appendChild(form);
    ziel.appendChild(el("div", { class: "editor__raster", style: "gap:20px" }, [
      bildUpload("titelbild", "Titelbild der Startseite", "bilder/vereinsheim.jpg", "image/jpeg", 2400),
      bildUpload("logo", "Vereinslogo", "bilder/logo.png", "image/png", 400)
    ]));
  }

  /* ---------- Einstellungen ---------- */
  function zeigeEinstellungen(ziel) {
    ziel.textContent = "";
    ziel.appendChild(el("div", { class: "bereich-kopf" }, [el("h2", { text: "Einstellungen" })]));

    var status = el("div", { class: "karte editor", style: "border-color:transparent" }, [el("h3", { text: "System" })]);
    var sl = el("ul", { class: "uebersicht-liste" });
    [["Rechner", STATUS.rechner], ["Speicherort", (STATUS.aufStick ? "USB-Stick: " : "") + (STATUS.speicherort || "?")],
     ["Freier Speicher", STATUS.freiGB != null ? String(STATUS.freiGB).replace(".", ",") + " GB von " + String(STATUS.gesamtGB).replace(".", ",") + " GB" : "?"],
     ["Angemeldet über", STATUS.ueberInternet ? "Internet (Fernzugriff)" : "Netzwerk vor Ort"], ["Version", STATUS.version]].forEach(function (z) {
      sl.appendChild(el("li", null, [el("b", { text: z[0] + ":" }), " " + (z[1] || "–")]));
    });
    status.appendChild(sl);
    if (STATUS.freiGB != null && STATUS.freiGB < 1) status.appendChild(el("p", { class: "meldung meldung--fehler", text: "Der Speicher ist fast voll. Bitte alte Fotos auf einen PC sichern und vom Stick löschen." }));
    ziel.appendChild(status);

    // --- Präsentation / Vorschau
    var vs = el("input", { type: "checkbox", id: "vorschau-an" }); vs.checked = D.verein.vorschau === true;
    vs.addEventListener("change", function () {
      D.verein.vorschau = vs.checked;
      speichern(vs.checked ? "Vorschau-Hinweis eingeschaltet" : "Vorschau-Hinweis ausgeschaltet").catch(function () { /* Meldung kommt aus speichern() */ });
    });
    var anzahlBeispiele = function () {
      return ["neuigkeiten", "termine", "veranstaltungen"].reduce(function (n, k) { return n + (D[k] || []).filter(function (x) { return x.beispiel; }).length; }, 0);
    };
    var bsInfo = el("p", { class: "leise", role: "status" });
    function bsText() { var n = anzahlBeispiele(); bsInfo.textContent = n ? n + " Beispiel-Einträge sind geladen." : "Derzeit keine Beispieldaten geladen."; }
    bsText();
    function beispiel(aktion) {
      api("api/admin/" + aktion, {}).then(function () { return datenLaden(); }).then(function () {
        toast(aktion === "beispiel-laden" ? "Beispieldaten geladen ✓" : "Beispieldaten entfernt ✓"); bsText();
      }).catch(function (e) { toast(e.message, true); });
    }
    ziel.appendChild(el("div", { class: "karte editor", style: "border-color:transparent" }, [
      el("h3", { text: "Präsentation" }),
      el("label", { class: "schalter", style: "font-size:16px;color:var(--blau)" }, [vs, "Hinweis „Vorschau – noch nicht veröffentlicht“ oben auf der Webseite zeigen"]),
      el("p", { class: "leise", style: "margin-top:14px", text: "Beispieldaten füllen die Webseite für die Vorführung mit ein paar Neuigkeiten, Terminen und einer Veranstaltung. Sie sind als „Beispiel“ gekennzeichnet und lassen sich mit einem Klick wieder entfernen – eigene Einträge bleiben unberührt." }),
      bsInfo,
      el("div", { class: "editor__knoepfe" }, [
        el("button", { type: "button", class: "knopf knopf--akzent", text: "Beispieldaten laden", onclick: function () { beispiel("beispiel-laden"); } }),
        el("button", { type: "button", class: "knopf knopf--hell", text: "Beispieldaten entfernen", onclick: function () { beispiel("beispiel-entfernen"); } })
      ])
    ]));

    ziel.appendChild(passwortFormular("Passwort ändern", "Das Passwort gilt für alle, die die Webseite pflegen. Bei Wechsel im Vorstand bitte ändern und neu weitergeben.", function () { toast("Passwort geändert ✓"); }));

    var prot = el("div", { class: "karte editor", style: "border-color:transparent" }, [el("h3", { text: "Änderungsprotokoll" }),
      el("p", { class: "leise", text: "Wer hat wann was geändert (die letzten 30 Einträge)." })]);
    var protListe = el("ul", { class: "uebersicht-liste" }, [el("li", { text: "Wird geladen …" })]);
    prot.appendChild(protListe);
    ziel.appendChild(prot);
    api("api/admin/protokoll").then(function (j) {
      protListe.textContent = "";
      if (!j.eintraege.length) protListe.appendChild(el("li", { class: "leise", text: "Noch keine Einträge." }));
      j.eintraege.forEach(function (e) { protListe.appendChild(el("li", null, [el("b", { text: e.zeit }), " " + e.name + ": " + e.text])); });
    }).catch(function () { protListe.textContent = ""; });

    var ergebnis = el("p", { role: "status" });
    ziel.appendChild(el("div", { class: "karte editor", style: "border-color:transparent" }, [
      el("h3", { text: "Für die Online-Webseite exportieren" }),
      el("p", { class: "leise", text: "Erstellt im Ordner „export“ eine fertige Webseite mit allen Terminen, Ergebnissen und Fotos (auch als ZIP). Diese kann z. B. auf GitHub Pages hochgeladen werden." }),
      el("button", { type: "button", class: "knopf knopf--akzent", text: "Export erstellen", onclick: function () {
        ergebnis.className = "meldung meldung--ok"; ergebnis.textContent = "Wird erstellt …";
        api("api/admin/export", {}).then(function (j) {
          ergebnis.textContent = "Fertig ✓ " + j.fotos + " Fotos. Ordner: " + j.ordner + " · ZIP: " + j.zip;
        }).catch(function (e) { ergebnis.className = "meldung meldung--fehler"; ergebnis.textContent = e.message; });
      } }),
      ergebnis
    ]));

    ziel.appendChild(el("div", { class: "karte editor", style: "border-color:transparent" }, [
      el("h3", { text: "Sicherungen" }),
      el("p", { class: "leise", text: "Bei jedem Speichern wird automatisch eine Sicherung angelegt (Ordner data/sicherung auf dem Stick, die letzten 50). Auf dem Raspberry Pi liegt zusätzlich täglich eine Kopie auf der SD-Karte. Gelöschte Fotos landen im Ordner fotos/_papierkorb. Den Stick regelmäßig (z. B. monatlich) auf einen PC kopieren." })
    ]));
  }

  /* ---------- Übersicht ---------- */
  function zeigeUebersicht(ziel) {
    ziel.textContent = "";
    ziel.appendChild(el("div", { class: "bereich-kopf" }, [el("h2", { text: "Übersicht" })]));
    ziel.appendChild(el("p", { class: "bereich-hinweis", text: "Was möchtest du tun?" }));
    var aktionen = el("div", { class: "schnell" });
    [["neuigkeiten", "Neuigkeit schreiben"], ["termine", "Termin eintragen"], ["ergebnisse", "Ergebnis eintragen"], ["veranstaltungen", "Veranstaltung anlegen"], ["fotos", "Fotos hochladen"]].forEach(function (a) {
      aktionen.appendChild(el("button", { type: "button", class: "schnell__knopf", onclick: function () { reiterZeigen(a[0], true); } }, [
        el("span", { class: "schnell__plus", "aria-hidden": "true", text: "+" }), a[1]]));
    });
    ziel.appendChild(aktionen);

    var heute = heuteISO();
    var kommend = (D.termine || []).concat((D.veranstaltungen || []).map(function (v) { return { datum: v.datum, titel: v.titel, zeit: "" }; }))
      .filter(function (t) { return t.datum >= heute; }).sort(function (a, b) { return (a.datum + (a.zeit || "")).localeCompare(b.datum + (b.zeit || "")); });
    var zahlen = el("div", { class: "zahlenreihe" });
    function zahl(wert, text, reiter) {
      zahlen.appendChild(el("button", { type: "button", class: "karte zahlkarte", onclick: function () { reiterZeigen(reiter); } }, [el("b", { text: String(wert) }), el("span", { text: text })]));
    }
    zahl((D.neuigkeiten || []).length, "Neuigkeiten", "neuigkeiten");
    zahl(kommend.length, "kommende Termine", "termine");
    zahl((D.ergebnisse || []).length, "Ergebnisse", "ergebnisse");
    var fotoKarte = el("span"); zahlen.appendChild(fotoKarte);
    ziel.appendChild(zahlen);
    api("api/admin/alben").then(function (j) {
      var n = j.alben.reduce(function (s, a) { return s + a.bilder.length; }, 0);
      var k = el("button", { type: "button", class: "karte zahlkarte", onclick: function () { reiterZeigen("fotos"); } }, [el("b", { text: String(n) }), el("span", { text: "Fotos in " + j.alben.length + " Alben" })]);
      fotoKarte.replaceWith(k);
    }).catch(function () { fotoKarte.remove(); });

    var box = el("div", { class: "karte", style: "padding:22px;margin-top:20px" }, [el("h3", { style: "font-size:22px;margin-bottom:8px", text: "Nächste Termine" })]);
    if (!kommend.length) box.appendChild(el("p", { class: "leise", text: "Keine Turniere oder Feste eingetragen." }));
    var ul = el("ul", { class: "uebersicht-liste" });
    kommend.slice(0, 5).forEach(function (t) { ul.appendChild(el("li", null, [el("b", { text: datumDE(t.datum) + (t.zeit ? " " + t.zeit : "") }), " " + t.titel])); });
    box.appendChild(ul);
    var tr = (D.regelTraining || []).slice().sort(function (a, b) { return a.wochentag - b.wochentag; })
      .map(function (r) { return WT[r.wochentag] + (r.zeit ? " " + r.zeit : "") + ": " + r.titel; }).join(" · ");
    if (tr) box.appendChild(el("p", { class: "leise", style: "margin-top:10px", text: "Training (automatisch jede Woche): " + tr }));
    ziel.appendChild(box);

    var entwuerfe = ["neuigkeiten", "termine", "veranstaltungen"].reduce(function (n, k) { return n + (D[k] || []).filter(function (x) { return x.entwurf; }).length; }, 0);
    if (entwuerfe) ziel.appendChild(el("p", { class: "meldung meldung--hinweis", text: entwuerfe + " Eintrag/Einträge sind als Entwurf gespeichert und noch nicht auf der Webseite sichtbar." }));
    if (STATUS.freiGB != null && STATUS.freiGB < 1) ziel.appendChild(el("p", { class: "meldung meldung--fehler", text: "Der Speicher ist fast voll (" + STATUS.freiGB + " GB frei). Bitte Bescheid geben." }));

    var zuletzt = el("div", { class: "karte", style: "padding:22px;margin-top:20px" }, [el("h3", { style: "font-size:22px;margin-bottom:8px", text: "Zuletzt geändert" })]);
    var zl = el("ul", { class: "uebersicht-liste" });
    zuletzt.appendChild(zl);
    ziel.appendChild(zuletzt);
    api("api/admin/protokoll").then(function (j) {
      var e = j.eintraege.filter(function (x) { return x.text.indexOf("angemeldet") !== 0; }).slice(0, 5);
      if (!e.length) zl.appendChild(el("li", { class: "leise", text: "Noch keine Änderungen." }));
      e.forEach(function (x) { zl.appendChild(el("li", null, [el("b", { text: x.zeit }), " " + x.name + ": " + x.text])); });
    }).catch(function () { zuletzt.remove(); });
  }

  /* ---------- Passwort-Formular (Ersteinrichtung + Einstellungen) ---------- */
  function passwortFormular(titel, text, fertig) {
    var p1 = el("input", { id: "pw-neu", type: "password", autocomplete: "new-password", minlength: "8" });
    var p2 = el("input", { id: "pw-neu2", type: "password", autocomplete: "new-password", minlength: "8" });
    var meldung = el("p", { class: "meldung meldung--fehler", role: "alert", hidden: true });
    var form = el("form", { class: "karte editor", style: "border-color:transparent", novalidate: true }, [
      el("h3", { text: titel }),
      el("p", { class: "leise", text: text }),
      el("div", { class: "formular", style: "max-width:380px" }, [
        el("label", { for: "pw-neu", text: "Neues Passwort (mindestens 8 Zeichen)" }), p1,
        el("label", { for: "pw-neu2", text: "Passwort wiederholen" }), p2,
        el("p", { class: "feld-hilfe", text: "Tipp: ein kurzer Satz ist sicher und leicht zu merken, z. B. „Stock-Halle-Grein-2026“." }),
        meldung,
        el("button", { type: "submit", class: "knopf knopf--dunkel", text: "Passwort speichern" })])
    ]);
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      meldung.hidden = true;
      if (p1.value.length < 8) { meldung.textContent = "Das Passwort muss mindestens 8 Zeichen haben."; meldung.hidden = false; return; }
      if (p1.value !== p2.value) { meldung.textContent = "Die beiden Eingaben stimmen nicht überein."; meldung.hidden = false; return; }
      api("api/admin/pin", { pin: p1.value }).then(function () { p1.value = ""; p2.value = ""; fertig(); })
        .catch(function (e) { meldung.textContent = e.message; meldung.hidden = false; });
    });
    return form;
  }

  function zeigeErsteinrichtung() {
    $("anmeldung").hidden = true;
    $("arbeitsbereich").hidden = false;
    $("kopf-aktionen").hidden = false;
    $("reiter").textContent = "";
    var b = $("bereich");
    b.textContent = "";
    b.appendChild(el("div", { class: "bereich-kopf" }, [el("h2", { text: "Willkommen! Bitte zuerst ein eigenes Passwort festlegen" })]));
    b.appendChild(passwortFormular("Eigenes Passwort",
      "Die Start-PIN gilt nur für die allererste Anmeldung. Das neue Passwort gibst du an alle weiter, die die Webseite pflegen sollen.",
      function () { toast("Passwort gespeichert ✓"); STATUS.ersteinrichtung = false; datenLaden().then(start); }));
  }

  /* ---------- Reiter ---------- */
  var REITER = [
    ["uebersicht", "Übersicht", zeigeUebersicht],
    ["neuigkeiten", "Neuigkeiten", function (z, neu) { zeigeListe("neuigkeiten", z, neu); }],
    ["termine", "Termine", function (z, neu) { zeigeListe("termine", z, neu); }],
    ["ergebnisse", "Ergebnisse", function (z, neu) { zeigeListe("ergebnisse", z, neu); }],
    ["veranstaltungen", "Veranstaltungen", function (z, neu) { zeigeListe("veranstaltungen", z, neu); }],
    ["training", "Training", function (z) { zeigeListe("regelTraining", z); }],
    ["fotos", "Fotos", function (z, neu) { zeigeFotos(z); if (neu) setTimeout(function () { var n = $("album-name"); if (n) n.focus(); }, 50); }],
    ["vorstand", "Vorstand", function (z) { zeigeListe("vorstand", z); }],
    ["verein", "Verein", zeigeVerein],
    ["einstellungen", "Einstellungen", zeigeEinstellungen]
  ];

  var HAUPTREITER = ["uebersicht", "neuigkeiten", "termine", "ergebnisse", "fotos"];

  function reiterZeigen(id, neu) {
    var r = REITER.filter(function (x) { return x[0] === id; })[0] || REITER[0];
    if (r[0] !== AKTUELLER_REITER && UNGESPEICHERT && !window.confirm("Deine Eingaben sind noch nicht gespeichert. Trotzdem wechseln?")) {
      var a = $("reiter-auswahl"); if (a) a.value = AKTUELLER_REITER;
      return;
    }
    UNGESPEICHERT = false;
    AKTUELLER_REITER = r[0];
    $("reiter").querySelectorAll("button[data-id]").forEach(function (b) { b.setAttribute("aria-selected", b.dataset.id === r[0] ? "true" : "false"); });
    var auswahl = $("reiter-auswahl"); if (auswahl) auswahl.value = r[0];
    if (HAUPTREITER.indexOf(r[0]) < 0) { var w = $("reiter-weitere"); if (w) w.hidden = false; }
    r[2]($("bereich"), neu);
    try { sessionStorage.setItem("esvReiter", r[0]); } catch (e) { /* egal */ }
  }

  function start() {
    $("anmeldung").hidden = true;
    $("arbeitsbereich").hidden = false;
    $("kopf-aktionen").hidden = false;
    var nav = $("reiter"); nav.textContent = "";
    // Handy: eine Auswahlliste
    var auswahl = el("select", { id: "reiter-auswahl", class: "reiter__auswahl", "aria-label": "Bereich wählen" });
    REITER.forEach(function (r) { auswahl.appendChild(el("option", { value: r[0], text: r[1] })); });
    auswahl.addEventListener("change", function () { reiterZeigen(auswahl.value); });
    nav.appendChild(auswahl);
    // PC: Hauptbereiche + „Weitere“
    var haupt = el("div", { class: "reiter__gruppe" });
    var weitere = el("div", { class: "reiter__gruppe reiter__gruppe--weitere", id: "reiter-weitere", hidden: true });
    REITER.forEach(function (r) {
      var k = el("button", { type: "button", role: "tab", "data-id": r[0], text: r[1], onclick: function () { reiterZeigen(r[0]); } });
      (HAUPTREITER.indexOf(r[0]) >= 0 ? haupt : weitere).appendChild(k);
    });
    var mehr = el("button", { type: "button", class: "reiter__mehr", "aria-expanded": "false", "aria-controls": "reiter-weitere", text: "Weitere ▾" });
    mehr.addEventListener("click", function () { weitere.hidden = !weitere.hidden; mehr.setAttribute("aria-expanded", weitere.hidden ? "false" : "true"); mehr.textContent = weitere.hidden ? "Weitere ▾" : "Weitere ▴"; });
    haupt.appendChild(mehr);
    nav.appendChild(haupt);
    nav.appendChild(weitere);
    var letzter = "uebersicht";
    try { letzter = sessionStorage.getItem("esvReiter") || "uebersicht"; } catch (e) { /* egal */ }
    reiterZeigen(letzter);
  }

  var STATUS = {};
  function datenLaden() {
    var st = api("api/admin/status").then(function (s) { STATUS = s; }).catch(function () { /* egal */ });
    return Promise.all([st, api("api/admin/daten")]).then(function (r) {
      var j = r[1];
      D = j;
      D.verein = D.verein || {};
      ["neuigkeiten", "termine", "ergebnisse", "veranstaltungen", "regelTraining", "trainingsfrei", "vorstand"].forEach(function (k) { D[k] = D[k] || []; });
    });
  }

  function abmelden(grund) {
    if (TOKEN && !grund) fetch("api/admin/abmelden", { method: "POST", headers: { "X-Token": TOKEN } }).catch(function () { /* egal */ });
    TOKEN = ""; UNGESPEICHERT = false;
    try { sessionStorage.removeItem("esvToken"); } catch (e) { /* egal */ }
    $("arbeitsbereich").hidden = true; $("kopf-aktionen").hidden = true; $("anmeldung").hidden = false;
    $("pin-eingabe").value = "";
    if (grund) { $("anmelde-fehler").textContent = grund; $("anmelde-fehler").hidden = false; }
    $("pin-eingabe").focus();
  }

  $("abmelden").addEventListener("click", function () {
    if (UNGESPEICHERT && !window.confirm("Deine Eingaben sind noch nicht gespeichert. Trotzdem abmelden?")) return;
    abmelden();
  });
  window.addEventListener("beforeunload", function (ev) { if (UNGESPEICHERT) { ev.preventDefault(); ev.returnValue = ""; } });
  try { $("name-eingabe").value = localStorage.getItem("esvName") || ""; } catch (e) { /* egal */ }
  $("anmelde-form").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var p = $("pin-eingabe").value.trim();
    var name = $("name-eingabe").value.trim();
    try { localStorage.setItem("esvName", name); } catch (e) { /* egal */ }
    $("anmelde-fehler").hidden = true;
    fetch("api/admin/anmelden", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: p, name: name }) })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (!r.ok) throw new Error(j.fehler || "PIN falsch");
          TOKEN = j.token; try { sessionStorage.setItem("esvToken", TOKEN); } catch (e) { /* egal */ }
          if (j.ersteinrichtung) { zeigeErsteinrichtung(); return; }
          return datenLaden().then(start);
        });
      })
      .catch(function (e) {
        $("anmelde-fehler").textContent = e.message === "PIN falsch" ? "Das Passwort ist falsch." : (/fetch|NetworkError/i.test(e.message) ? "Keine Verbindung zum Vereins-Server." : e.message);
        $("anmelde-fehler").hidden = false;
      });
  });

  if (!/^https?:$/.test(location.protocol)) {
    $("kein-server").hidden = false;
  } else if (TOKEN) {
    datenLaden().then(start).catch(function () { /* abmelden() passiert in api() */ });
  } else {
    $("pin-eingabe").focus();
  }
})();
