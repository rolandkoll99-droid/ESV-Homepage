/* =====================================================================
   ESV GREIN – Seitenlogik
   Hier muss normalerweise nichts geändert werden.
   Inhalte kommen aus der Google-Tabelle (bzw. js/daten.js),
   geladen über js/tabelle.js.
   ===================================================================== */
(function () {
  "use strict";

  var D, V;
  var MONATE = ["Jän", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
  var ARTEN = { training: "Training", meisterschaft: "Meisterschaft", turnier: "Turnier", fest: "Vereinsfest" };

  /* ---------- Hilfsfunktionen ---------- */
  function $(id) { return document.getElementById(id); }

  function el(tag, attrs, kinder) {
    var e = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === "text") e.textContent = attrs[k];
        else if (k === "class") e.className = attrs[k];
        else e.setAttribute(k, attrs[k]);
      });
    }
    (kinder || []).forEach(function (k) { if (k) e.appendChild(k); });
    return e;
  }

  function datum(s) {
    var p = String(s || "").split("-");
    return new Date(+p[0], (+p[1] || 1) - 1, +p[2] || 1);
  }

  function heute() {
    var d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function datumLang(s) {
    var d = datum(s);
    return d.toLocaleDateString("de-AT", { weekday: "short", day: "numeric", month: "long", year: "numeric" });
  }

  function datumKurz(s) {
    var d = datum(s);
    return ("0" + d.getDate()).slice(-2) + "." + ("0" + (d.getMonth() + 1)).slice(-2) + "." + d.getFullYear();
  }

  function leer(text) { return el("p", { class: "leer", text: text }); }

  // Noch nicht ausgefüllte Platzhalter wie "[Telefonnummer]" nicht anzeigen
  function echt(w) {
    var s = String(w == null ? "" : w).trim();
    return s && !/\[[^\]]*\]/.test(s) ? s : "";
  }

  /* ---------- Menü am Handy ---------- */
  var knopf = document.querySelector(".menuknopf");
  var menue = $("hauptmenue");
  knopf.addEventListener("click", function () {
    var offen = menue.classList.toggle("offen");
    knopf.setAttribute("aria-expanded", offen ? "true" : "false");
    knopf.setAttribute("aria-label", offen ? "Menü schließen" : "Menü öffnen");
  });
  function menueZu() {
    menue.classList.remove("offen");
    knopf.setAttribute("aria-expanded", "false");
    knopf.setAttribute("aria-label", "Menü öffnen");
  }
  menue.addEventListener("click", function (e) {
    if (e.target.tagName === "A") menueZu();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && menue.classList.contains("offen")) { menueZu(); knopf.focus(); }
  });

  /* =================== Darstellung =================== */
  function zeigen(daten) {
  D = daten;
  V = D.verein || {};

  /* ---------- Vereinsdaten in die Seite einsetzen ---------- */
  ["adresse", "plzOrt", "telefon", "email", "mitgliedsbeitrag", "trainingszeiten"].forEach(function (k) { V[k] = echt(V[k]); });
  document.querySelectorAll("[data-feld]").forEach(function (n) {
    var wert = echt(V[n.getAttribute("data-feld")]);
    if (wert) n.textContent = wert;
  });

  if (V.telefon) $("tel-link").href = "tel:" + V.telefon.replace(/[^\d+]/g, "");
  else $("zeile-tel").hidden = true;
  if (V.email) $("mail-link").href = "mailto:" + V.email;
  else $("zeile-mail").hidden = true;
  if (!V.mitgliedsbeitrag) $("zeile-beitrag").hidden = true;
  $("karte-link").href = "https://www.google.com/maps/search/?api=1&query=" +
    encodeURIComponent("Stockbahn ESV Grein " + (V.adresse || "") + " " + (V.plzOrt || "Grein"));
  if (V.anmeldeformular) $("anmeldelink").href = V.anmeldeformular;
  if (V.probetraining) $("probelink").href = V.probetraining;
  ["fb-link", "fb-fuss"].forEach(function (id) { $(id).href = V.facebook || "#"; });
  if (V.telefon) $("probe-tel").href = "tel:" + V.telefon.replace(/[^\d+]/g, ""); else $("probe-tel").hidden = true;
  zeigeNeuigkeiten(D.neuigkeiten || []);
  $("jahr").textContent = new Date().getFullYear();

  /* ---------- Termine (inkl. automatischem Regeltraining) ---------- */
  var termine = window.ESVTermine(D, 12);

  // Trainingszeiten-Text automatisch, falls nicht selbst eingetragen
  if (!V.trainingszeiten && (D.regelTraining || []).length) {
    V.trainingszeiten = window.ESVTrainingszeiten(D);
    document.querySelectorAll('[data-feld="trainingszeiten"]').forEach(function (n) { n.textContent = V.trainingszeiten; });
  }

  /* Liste: nur echte Termine (Turniere, Feste, Veranstaltungen) – Training steht im Monatskalender */
  var sonder = (D.termine || []).map(function (t) { return { datum: t.datum, zeit: t.zeit, titel: t.titel, ort: t.ort, art: ARTEN[t.art] ? t.art : "turnier" }; })
    .concat((D.veranstaltungen || []).map(function (v) { return { datum: v.datum, zeit: "", titel: v.titel, ort: "", art: "fest", link: "#veranstaltungen" }; }))
    .filter(function (t) { return t.datum && datum(t.datum) >= heute(); })
    .sort(function (a, b) { return (a.datum + (a.zeit || "")).localeCompare(b.datum + (b.zeit || "")); });
  var tl = $("terminliste");
  tl.textContent = "";
  var TERMINE_START = 5;
  if (!sonder.length) {
    tl.appendChild(el("li", null, [leer("Derzeit keine Turniere oder Feste eingetragen. Die Trainingstage stehen im Kalender.")]));
  }
  sonder.forEach(function (t, i) {
    var d = datum(t.datum);
    var li = el("li", { class: "termin-kurz" + (i >= TERMINE_START ? " termin-kurz--mehr" : "") }, [
      el("span", { class: "termin-kurz__datum" }, [
        el("b", { text: d.toLocaleDateString("de-AT", { weekday: "short" }).replace(".", "") }),
        document.createTextNode(" " + ("0" + d.getDate()).slice(-2) + "." + ("0" + (d.getMonth() + 1)).slice(-2) + ".")
      ]),
      el("span", { class: "termin-kurz__info" }, [
        el("span", { class: "termin-kurz__titel", text: t.titel || "" }),
        el("span", { class: "termin-kurz__ort", text: [t.zeit ? t.zeit + " Uhr" : "", t.ort || ""].filter(Boolean).join(" · ") })
      ]),
      el("span", { class: "tag tag--" + t.art, text: t.art === "fest" ? "Fest / Veranst." : ARTEN[t.art] })
    ]);
    if (i >= TERMINE_START) li.hidden = true;
    tl.appendChild(li);
  });
  var tMehr = $("termine-mehr");
  if (sonder.length > TERMINE_START) {
    tMehr.hidden = false;
    tMehr.textContent = "Alle " + sonder.length + " Termine anzeigen";
    tMehr.onclick = function () {
      var zu = tMehr.getAttribute("data-offen") === "1";
      tl.querySelectorAll(".termin-kurz--mehr").forEach(function (x) { x.hidden = zu; });
      tMehr.setAttribute("data-offen", zu ? "0" : "1");
      tMehr.textContent = zu ? "Alle " + sonder.length + " Termine anzeigen" : "Weniger anzeigen";
    };
  }
  monatsKalender();

  if (V.googleKalenderId) {
    $("googlekalender").appendChild(el("iframe", {
      title: "Vereinskalender (Google)",
      loading: "lazy",
      src: "https://calendar.google.com/calendar/embed?ctz=Europe%2FVienna&hl=de&mode=AGENDA&src=" + encodeURIComponent(V.googleKalenderId)
    }));
  }

  /* ---------- Ergebnisse ---------- */
  var ergebnisse = (D.ergebnisse || []).slice().sort(function (a, b) { return datum(b.datum) - datum(a.datum); });
  var saisonen = [];
  ergebnisse.forEach(function (e) { if (e.saison && saisonen.indexOf(e.saison) < 0) saisonen.push(e.saison); });

  function platzZelle(e) {
    var td = el("td");
    var cls = "platz" + (e.platz >= 1 && e.platz <= 3 ? " platz--" + e.platz : "");
    td.appendChild(el("span", { class: cls, text: e.platz + "." }));
    if (e.teilnehmer) td.appendChild(el("span", { class: "platz__von", text: "von " + e.teilnehmer }));
    return td;
  }

  function zeigeErgebnisse(saison) {
    var tb = $("ergebnistabelle");
    tb.textContent = "";
    var liste = ergebnisse.filter(function (e) { return !saison || e.saison === saison; });
    if (!liste.length) {
      tb.appendChild(el("tr", null, [el("td", { colspan: "6", class: "leer", text: "Noch keine Ergebnisse eingetragen." })]));
      return;
    }
    var ERG_START = 5;
    var mehrBox = $("ergebnis-mehr-box"), mehrKnopf = $("ergebnis-mehr");
    mehrBox.hidden = liste.length <= ERG_START;
    mehrKnopf.textContent = "Alle " + liste.length + " Ergebnisse anzeigen";
    mehrKnopf.onclick = function () {
      var zu = mehrKnopf.getAttribute("data-offen") === "1";
      tb.querySelectorAll(".erg-mehr").forEach(function (x) { x.hidden = zu; });
      mehrKnopf.setAttribute("data-offen", zu ? "0" : "1");
      mehrKnopf.textContent = zu ? "Alle " + liste.length + " Ergebnisse anzeigen" : "Weniger anzeigen";
    };
    mehrKnopf.setAttribute("data-offen", "0");
    liste.forEach(function (e, i) {
      var pdf = el("td");
      if (e.pdf) pdf.appendChild(el("a", { href: e.pdf, target: "_blank", rel: "noopener", text: "Liste (PDF)" }));
      var zeile = el("tr", { class: i >= ERG_START ? "erg-mehr" : "" });
      if (i >= ERG_START) zeile.hidden = true;
      tb.appendChild(zeile);
      [
        el("td", { text: datumKurz(e.datum) }),
        el("td", null, [el("strong", { text: e.bewerb || "" }), el("span", { class: "ort", text: e.ort || "" })]),
        el("td", { text: e.mannschaft || "" }),
        platzZelle(e),
        el("td", { text: e.punkte || "" }),
        pdf
      ].forEach(function (z) { zeile.appendChild(z); });
    });
  }

  var filter = $("ergebnisfilter");
  [""].concat(saisonen).forEach(function (s, i) {
    var b = el("button", { type: "button", "aria-pressed": i === 0 ? "true" : "false", text: s || "Alle" });
    b.addEventListener("click", function () {
      filter.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", "false"); });
      b.setAttribute("aria-pressed", "true");
      zeigeErgebnisse(s);
    });
    filter.appendChild(b);
  });
  if (saisonen.length < 2) filter.style.display = "none";
  zeigeErgebnisse("");

  /* ---------- Veranstaltungen ---------- */
  var events = (D.veranstaltungen || [])
    .filter(function (v) { return datum(v.datum) >= heute(); })
    .sort(function (a, b) { return datum(a.datum) - datum(b.datum); });
  var ev = $("eventliste");
  if (!events.length) {
    ev.appendChild(el("div", { class: "karte" }, [leer("Aktuell sind keine Veranstaltungen geplant. Neuigkeiten gibt es auch auf unserer Facebook-Seite.")]));
  }
  events.forEach(function (v) {
    var links = el("div", { class: "knopfreihe" });
    if (v.ausschreibung) links.appendChild(el("a", { class: "knopf knopf--hell", href: v.ausschreibung, target: "_blank", rel: "noopener", text: "Ausschreibung" }));
    links.appendChild(el("a", { class: "knopf knopf--dunkel", href: "#kontakt", text: "Anmelden" }));
    ev.appendChild(el("article", { class: "karte event" }, [
      v.bild ? el("img", { class: "event__bild", src: v.bild, alt: "", loading: "lazy" }) : null,
      el("div", { class: "event__inhalt" }, [
        el("span", { class: "event__datum", text: datumLang(v.datum) }),
        el("h3", { text: v.titel || "" }),
        v.text ? el("p", { class: "event__text", text: v.text }) : null,
        links
      ])
    ]));
  });

  /* ---------- Titelbild aus der Tabelle (optional) ---------- */
  if (V.titelbild) {
    var url = String(V.titelbild).replace(/["\\()]/g, function (z) { return encodeURIComponent(z); });
    document.querySelector(".held").style.backgroundImage =
      'linear-gradient(rgba(11, 31, 51, .78), rgba(11, 31, 51, .62)), url("' + url + '")';
  }

  /* ---------- Fotos ---------- */
  $("fb-fotos").href = V.facebook || "#";
  zeigeGalerie(D.fotos || []);

  /* ---------- Vorstand ---------- */
  // Nur Personen mit eingetragenem Namen zeigen; ohne Namen den Bereich ausblenden
  var vs = $("vorstand");
  var personen = (D.vorstand || []).filter(function (p) { return echt(p.name); });
  $("vorstand-bereich").hidden = !personen.length;
  personen.forEach(function (p) {
    var foto;
    if (p.foto) {
      foto = el("img", { class: "person__foto", src: p.foto, alt: "Foto " + (p.name || p.funktion), loading: "lazy" });
    } else {
      var initialen = p.name.split(" ").map(function (w) { return w.charAt(0); }).join("").slice(0, 2);
      foto = el("div", { class: "person__foto", "aria-hidden": "true", text: initialen });
    }
    vs.appendChild(el("div", { class: "karte person" }, [
      foto,
      el("div", { class: "person__name", text: p.name || "" }),
      el("div", { class: "person__funktion", text: p.funktion || "" })
    ]));
  });

  /* ---------- Auf einen Blick ---------- */
  if (termine[0]) {
    $("blick-termin-titel").textContent = termine[0].titel;
    var tage = Math.round((datum(termine[0].datum) - heute()) / 86400000);
    var wann = tage === 0 ? "Heute" : tage === 1 ? "Morgen" : datumLang(termine[0].datum);
    $("blick-termin-text").textContent = wann + (termine[0].zeit ? ", ab " + termine[0].zeit + " Uhr" : "") +
      (termine[0].ort ? " · " + termine[0].ort : "");
  } else {
    $("blick-termin-titel").textContent = "Training";
    $("blick-termin-text").textContent = V.trainingszeiten || "Termine folgen";
  }
  if (ergebnisse[0]) {
    var e0 = ergebnisse[0];
    $("blick-ergebnis-titel").textContent = e0.platz + ". Platz" + (e0.teilnehmer ? " von " + e0.teilnehmer : "");
    $("blick-ergebnis-text").textContent = e0.bewerb + " · " + datumKurz(e0.datum);
  }
  if (events[0]) {
    $("blick-event-titel").textContent = events[0].titel;
    $("blick-event-text").textContent = datumLang(events[0].datum);
  } else {
    $("blick-event-titel").textContent = "Folgt in Kürze";
    $("blick-event-text").textContent = "Infos auch auf Facebook";
  }

  /* ---------- Facebook-Beiträge (erst nach Klick laden – Datenschutz) ---------- */
  var fb = $("fb-bereich");
  if (V.facebookSeite) {
    var hinweis = el("div", { class: "fb-platzhalter" }, [
      el("p", { text: "Beim Laden der Beiträge werden Daten an Facebook (Meta) übertragen. Mehr dazu in der Datenschutzerklärung." })
    ]);
    var laden = el("button", { type: "button", class: "knopf knopf--hell", text: "Facebook-Beiträge anzeigen" });
    laden.addEventListener("click", function () {
      var url = "https://www.facebook.com/plugins/page.php?tabs=timeline&width=500&height=520&small_header=true&adapt_container_width=true&hide_cover=false&show_facepile=false&locale=de_DE&href=" +
        encodeURIComponent(V.facebookSeite);
      fb.textContent = "";
      fb.appendChild(el("iframe", { class: "fb-rahmen", title: "Beiträge der Facebook-Seite ESV Grein", src: url, loading: "lazy", allow: "encrypted-media" }));
    });
    hinweis.appendChild(laden);
    fb.appendChild(hinweis);
  }
  }

  /* =================== Präsentation: Vorschau-Hinweis + QR-Code =================== */
  function vorschauUndHandy(daten) {
    var v = daten.verein || {};
    if (v.vorschau) {
      $("vorschau-band").hidden = false;
      var beispiele = ["neuigkeiten", "termine", "veranstaltungen"].some(function (k) {
        return (daten[k] || []).some(function (x) { return x && x.beispiel; });
      });
      $("vorschau-beispiel").hidden = !beispiele;
    }
    var adressen = daten.lokaleAdressen || [];
    if (!adressen.length || typeof window.qrcode !== "function") return;
    var adresse = adressen[0];
    var knopf = $("handy-knopf"), dlg = $("handy-dialog");
    knopf.hidden = false;
    knopf.addEventListener("click", function () {
      var qr = window.qrcode(0, "M");
      qr.addData(adresse);
      qr.make();
      $("handy-qr").innerHTML = qr.createSvgTag({ cellSize: 8, margin: 2, scalable: true }); // nur aus der eigenen Adresse erzeugt
      $("handy-adresse").textContent = adresse;
      if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
    });
    $("handy-zu").addEventListener("click", function () { if (dlg.close) dlg.close(); else dlg.removeAttribute("open"); });
    dlg.addEventListener("click", function (ev) { if (ev.target === dlg && dlg.close) dlg.close(); });
  }

  /* =================== Neuigkeiten =================== */
  var NEWS_START = 3;
  function zeigeNeuigkeiten(liste) {
    var box = $("newsliste");
    box.textContent = "";
    var news = liste.filter(function (n) { return n.titel || n.text; }).slice().sort(function (a, b) {
      if (!!b.wichtig !== !!a.wichtig) return b.wichtig ? 1 : -1;
      return (b.datum || "").localeCompare(a.datum || "");
    });
    if (!news.length) {
      box.appendChild(el("div", { class: "karte" }, [leer("Derzeit keine Neuigkeiten.")]));
    }
    news.forEach(function (n, i) {
      var text = el("p", { class: "news__text", text: n.text || "" });
      var weiter = el("button", { type: "button", class: "link-knopf", text: "Weiterlesen", hidden: true });
      weiter.addEventListener("click", function () {
        var offen = text.classList.toggle("offen");
        weiter.textContent = offen ? "Weniger" : "Weiterlesen";
      });
      var karte = el("article", { class: "karte news" + (n.wichtig ? " news--wichtig" : "") }, [
        n.bild ? el("img", { class: "news__bild", src: n.bild, alt: "", loading: "lazy" }) : null,
        el("div", { class: "news__inhalt" }, [
          el("span", { class: "news__datum", text: (n.beispiel ? "Beispiel · " : "") + (n.wichtig ? "Wichtig · " : "") + (n.datum ? datumLang(n.datum) : "") }),
          el("h3", { text: n.titel || "" }),
          text, weiter
        ])
      ]);
      if (i >= NEWS_START) karte.hidden = true;
      box.appendChild(karte);
      if ((n.text || "").length > 220) weiter.hidden = false;
    });
    var mb = $("news-mehr-box");
    mb.hidden = news.length <= NEWS_START;
    $("news-mehr").onclick = function () { box.querySelectorAll(".news[hidden]").forEach(function (x) { x.hidden = false; }); mb.hidden = true; };
  }

  /* =================== Monatskalender =================== */
  var kalMonat = null, kalAuswahl = null;
  var MONATSNAMEN = ["Jänner", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

  function isoVon(d) { return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }

  function eintraegeAm(iso) {
    var liste = [];
    (D.termine || []).forEach(function (t) { if (t.datum === iso) liste.push({ zeit: t.zeit, titel: t.titel, ort: t.ort, art: ARTEN[t.art] ? t.art : "turnier" }); });
    (D.veranstaltungen || []).forEach(function (v) { if (v.datum === iso) liste.push({ zeit: "", titel: v.titel, ort: "", art: "fest" }); });
    var frei = (D.trainingsfrei || []).indexOf(iso) >= 0;
    if (!liste.length && !frei) {
      var wt = datum(iso).getDay() || 7;
      (D.regelTraining || []).forEach(function (r) {
        if (+r.wochentag === wt) liste.push({ zeit: r.zeit, titel: r.titel || "Training", ort: r.ort, art: "training" });
      });
    }
    liste.sort(function (a, b) { return String(a.zeit || "").localeCompare(String(b.zeit || "")); });
    return { liste: liste, frei: frei };
  }

  function tagDetail(iso) {
    var box = $("kal-tag");
    box.textContent = "";
    var info = eintraegeAm(iso);
    box.appendChild(el("h4", { text: datumLang(iso) }));
    if (!info.liste.length) {
      box.appendChild(el("p", { class: "leise-text", text: info.frei ? "Kein Training (trainingsfrei)." : "Keine Termine." }));
      return;
    }
    var ul = el("ul", { class: "kal-tag__liste" });
    info.liste.forEach(function (e) {
      ul.appendChild(el("li", null, [
        el("i", { class: "punkt punkt--" + e.art, "aria-hidden": "true" }),
        el("span", null, [el("strong", { text: e.titel || "" }), document.createTextNode([e.zeit ? " · " + e.zeit + " Uhr" : "", e.ort ? " · " + e.ort : ""].join(""))])
      ]));
    });
    box.appendChild(ul);
  }

  function monatsKalender() {
    if (!kalMonat) { var h = heute(); kalMonat = new Date(h.getFullYear(), h.getMonth(), 1); kalAuswahl = isoVon(h); }
    var gitter = $("kal-gitter");
    gitter.textContent = "";
    $("kal-titel").textContent = MONATSNAMEN[kalMonat.getMonth()] + " " + kalMonat.getFullYear();
    ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].forEach(function (w) { gitter.appendChild(el("span", { class: "kal-wt", "aria-hidden": "true", text: w })); });
    var versatz = (kalMonat.getDay() || 7) - 1;
    for (var i = 0; i < versatz; i++) gitter.appendChild(el("span", { class: "kal-leer", "aria-hidden": "true" }));
    var tage = new Date(kalMonat.getFullYear(), kalMonat.getMonth() + 1, 0).getDate();
    var heuteIso = isoVon(heute());
    for (var t = 1; t <= tage; t++) {
      (function (tag) {
        var d = new Date(kalMonat.getFullYear(), kalMonat.getMonth(), tag);
        var iso = isoVon(d);
        var info = eintraegeAm(iso);
        var punkte = el("span", { class: "kal-punkte", "aria-hidden": "true" });
        info.liste.slice(0, 3).forEach(function (e) { punkte.appendChild(el("i", { class: "punkt punkt--" + e.art })); });
        var label = d.toLocaleDateString("de-AT", { weekday: "long", day: "numeric", month: "long" }) +
          (info.liste.length ? ": " + info.liste.map(function (e) { return e.titel + (e.zeit ? " " + e.zeit : ""); }).join(", ") : "");
        var knopf = el("button", {
          type: "button",
          class: "kal-tagknopf" + (iso === heuteIso ? " kal-heute" : "") + (iso === kalAuswahl ? " kal-gewaehlt" : "") + (iso < heuteIso ? " kal-vorbei" : "") +
            (info.liste.some(function (e) { return e.art !== "training"; }) ? " kal-sonder" : ""),
          "aria-label": label, "aria-pressed": iso === kalAuswahl ? "true" : "false"
        }, [el("span", { text: String(tag) }), punkte]);
        knopf.addEventListener("click", function () { kalAuswahl = iso; monatsKalender(); tagDetail(iso); });
        gitter.appendChild(knopf);
      })(t);
    }
    tagDetail(kalAuswahl);
  }

  function monatWechseln(n) {
    kalMonat = new Date(kalMonat.getFullYear(), kalMonat.getMonth() + n, 1);
    var h = heute();
    // im aktuellen Monat: heute auswählen, sonst den ersten Tag mit Turnier/Fest, sonst den 1.
    if (kalMonat.getFullYear() === h.getFullYear() && kalMonat.getMonth() === h.getMonth()) { kalAuswahl = isoVon(h); }
    else {
      kalAuswahl = isoVon(kalMonat);
      var tage = new Date(kalMonat.getFullYear(), kalMonat.getMonth() + 1, 0).getDate();
      for (var t = 1; t <= tage; t++) {
        var iso = isoVon(new Date(kalMonat.getFullYear(), kalMonat.getMonth(), t));
        if (eintraegeAm(iso).liste.some(function (e) { return e.art !== "training"; })) { kalAuswahl = iso; break; }
      }
    }
    monatsKalender();
  }
  $("kal-zurueck").addEventListener("click", function () { monatWechseln(-1); });
  $("kal-weiter").addEventListener("click", function () { monatWechseln(1); });

  /* =================== Fotogalerie =================== */
  var ALBEN_START = 3, FOTOS_PRO_ALBUM = 8;

  function zeigeGalerie(fotos) {
    var g = $("galerie");
    g.textContent = "";
    var alben = {}, reihenfolge = [];
    fotos.forEach(function (f) {
      var name = f.album || "Allgemein";
      if (!alben[name]) { alben[name] = { name: name, datum: "", fotos: [], link: "" }; reihenfolge.push(name); }
      var a = alben[name];
      a.fotos.push(f);
      if (f.datum && f.datum > a.datum) a.datum = f.datum;
      if (f.albumLink && !a.link) a.link = f.albumLink;
    });
    var liste = reihenfolge.map(function (n) { return alben[n]; })
      .sort(function (a, b) { return (b.datum || "").localeCompare(a.datum || ""); });

    if (!liste.length) {
      var leerBox = el("div", { class: "karte galerie-leer" }, [
        el("p", { text: "Hier erscheinen bald Fotos von Turnieren, Training und Vereinsfesten." })
      ]);
      leerBox.appendChild(el("a", { class: "knopf knopf--fb", href: V.facebook || "#", target: "_blank", rel: "noopener", text: "Fotos auf Facebook ansehen" }));
      g.appendChild(leerBox);
      return;
    }

    liste.forEach(function (a, i) {
      var box = el("article", { class: "karte album" });
      if (i >= ALBEN_START) box.hidden = true;
      var kopf = el("div", { class: "album__kopf" }, [el("h3", { text: a.name })]);
      if (a.datum) kopf.appendChild(el("span", { class: "album__datum", text: datumLang(a.datum) + " · " + a.fotos.length + " Fotos" }));
      box.appendChild(kopf);

      var raster = el("div", { class: "album__raster" });
      a.fotos.slice(0, FOTOS_PRO_ALBUM).forEach(function (f, j) {
        var rest = a.fotos.length - FOTOS_PRO_ALBUM;
        var knopf = el("button", {
          type: "button",
          class: "foto" + (j === FOTOS_PRO_ALBUM - 1 && rest > 0 ? " foto--mehr" : ""),
          "aria-label": "Foto vergrößern: " + (f.text || a.name + ", Foto " + (j + 1))
        });
        if (j === FOTOS_PRO_ALBUM - 1 && rest > 0) knopf.setAttribute("data-mehr", "+" + (rest + 1));
        var img = el("img", { src: f.klein || f.gross, alt: f.text || "", loading: "lazy" });
        img.addEventListener("error", function () {
          knopf.remove();
          if (!raster.querySelector(".foto")) box.remove(); // Album ohne ladbare Fotos ausblenden
        });
        knopf.appendChild(img);
        knopf.addEventListener("click", function () { lightboxOeffnen(a, j); });
        raster.appendChild(knopf);
      });
      box.appendChild(raster);

      var fuss = el("div", { class: "album__fuss" });
      if (a.fotos.length > 1) {
        var alle = el("button", { type: "button", text: "Alle " + a.fotos.length + " Fotos als Diashow" });
        alle.addEventListener("click", function () { lightboxOeffnen(a, 0); });
        fuss.appendChild(alle);
      }
      if (a.link) fuss.appendChild(el("a", { href: a.link, target: "_blank", rel: "noopener", text: "Ganzes Album ansehen" }));
      if (fuss.childNodes.length) box.appendChild(fuss);
      g.appendChild(box);
    });

    var mehrBox = $("galerie-mehr-box");
    if (liste.length > ALBEN_START) {
      mehrBox.hidden = false;
      $("galerie-mehr").onclick = function () {
        g.querySelectorAll(".album[hidden]").forEach(function (x) { x.hidden = false; });
        mehrBox.hidden = true;
      };
    } else mehrBox.hidden = true;
  }

  /* ---------- Großansicht ---------- */
  var lb = $("lightbox"), lbAlbum = null, lbIndex = 0, wischX = null;

  function lightboxZeigen() {
    var f = lbAlbum.fotos[lbIndex];
    $("lb-bild").src = f.gross;
    $("lb-bild").alt = f.text || lbAlbum.name;
    $("lb-text").textContent = f.text || lbAlbum.name;
    $("lb-zaehler").textContent = (lbIndex + 1) + " / " + lbAlbum.fotos.length;
    var mehrere = lbAlbum.fotos.length > 1;
    $("lb-zurueck").hidden = !mehrere;
    $("lb-weiter").hidden = !mehrere;
  }
  function blaettern(n) {
    if (!lbAlbum) return;
    lbIndex = (lbIndex + n + lbAlbum.fotos.length) % lbAlbum.fotos.length;
    lightboxZeigen();
  }
  function lightboxOeffnen(album, index) {
    lbAlbum = album; lbIndex = index;
    lightboxZeigen();
    if (lb.showModal) lb.showModal(); else lb.setAttribute("open", "");
    $("lb-zu").focus();
  }
  function lightboxZu() { if (lb.close) lb.close(); else lb.removeAttribute("open"); }

  if (lb) {
    $("lb-zu").addEventListener("click", lightboxZu);
    $("lb-zurueck").addEventListener("click", function () { blaettern(-1); });
    $("lb-weiter").addEventListener("click", function () { blaettern(1); });
    lb.addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft") { blaettern(-1); e.preventDefault(); }
      if (e.key === "ArrowRight") { blaettern(1); e.preventDefault(); }
    });
    lb.addEventListener("click", function (e) { if (e.target === lb || e.target.classList.contains("lightbox__figur")) lightboxZu(); });
    lb.addEventListener("touchstart", function (e) { wischX = e.touches[0].clientX; }, { passive: true });
    lb.addEventListener("touchend", function (e) {
      if (wischX === null) return;
      var dx = e.changedTouches[0].clientX - wischX;
      if (Math.abs(dx) > 50) blaettern(dx < 0 ? 1 : -1);
      wischX = null;
    });
  }

  window.ESVLaden().then(function (e) {
    zeigen(e.daten);
    if (window.ESVWetter) window.ESVWetter(e.daten.verein);
    // PC-Version: Link zur Verwaltung in der Fußzeile
    if (e.bericht && e.bericht.quelle === "lokal") { $("verwaltung-link").hidden = false; $("verwaltung-oben").hidden = false; }
    vorschauUndHandy(e.daten);
  });
})();
