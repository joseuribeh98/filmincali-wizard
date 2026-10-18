"""Turns the official forms (tools/originals) into docxtemplater templates.

It only touches what the form asks to fill in: the ____ lines, the __ checkboxes and
the empty text boxes. Blocks the form says to "copy and paste as many times as
needed" are wrapped in a loop. Everything else (header, footer, legal text) stays
untouched.

Usage: python3 tools/templates.py
"""
import copy
import re
from pathlib import Path

import docx
from docx.table import Table
from docx.text.paragraph import Paragraph
from docx.text.run import Run

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "originals"
OUT = ROOT.parent / "public" / "templates"
BLANK = re.compile(r"_{2,}")


class Form:
    def __init__(self, name):
        self.name = name
        self.doc = docx.Document(SRC / f"{name}.docx")
        # Fixed references to the body elements by their original index.
        self.els = list(self.doc.element.body.iterchildren())

    def p(self, i) -> Paragraph:
        el = self.els[i]
        assert el.tag.endswith("}p"), f"{self.name}[{i}] is not a paragraph"
        return Paragraph(el, self.doc)

    def t(self, i) -> Table:
        el = self.els[i]
        assert el.tag.endswith("}tbl"), f"{self.name}[{i}] is not a table"
        return Table(el, self.doc)

    # --- operations ------------------------------------------------------
    def blanks(self, i, *tags):
        """Replaces each group of underscores with a tag, in order.

        Lines (4 or more underscores) get their own underlined run, with the
        original length in the tag ({name|length}) so the value keeps the
        form's line. Short checkboxes (__) stay as they were.
        """
        par = self.p(i)
        pending = list(tags)
        for run in list(par.runs):
            text = run.text
            if not BLANK.search(text):
                continue
            parts, pos = [], 0
            for m in BLANK.finditer(text):
                if not pending:
                    parts.append(("text", text[pos:m.start()]))
                    pos = m.end()
                    continue
                before = text[pos:m.start()]
                prev = text[m.start() - 1] if m.start() > 0 else " "
                if not prev.isspace() and prev not in "(":
                    before += " "
                parts.append(("text", before))
                length = m.end() - m.start()
                parts.append(("line" if length >= 4 else "checkbox", pending.pop(0), length))
                pos = m.end()
            parts.append(("text", text[pos:]))
            base = copy.deepcopy(run._r)  # original formatting, before underlining
            anchor = run._r
            first = True
            for part in parts:
                if part[0] == "text" and not part[1]:
                    continue
                if first:
                    r = run
                    first = False
                else:
                    new = copy.deepcopy(base)
                    anchor.addnext(new)
                    anchor = new
                    r = Run(new, par)
                if part[0] == "text":
                    r.text = part[1]
                elif part[0] == "line":
                    r.text = "{" + part[1] + "|" + str(part[2]) + "}"
                    r.font.underline = True
                else:
                    r.text = "{" + part[1] + "}"
            if first:
                run.text = ""
        assert not pending, f"{self.name}[{i}] leftover tags {pending}: {par.text!r}"

    def append(self, i, tag, sep=" "):
        par = self.p(i)
        if par.runs:
            par.runs[-1].text = par.runs[-1].text.rstrip() + sep + "{" + tag + "}"
        else:
            par.add_run("{" + tag + "}")

    def prefix(self, i, tag, strip=None):
        par = self.p(i)
        r = par.runs[0]
        txt = r.text
        if strip and txt.lstrip().startswith(strip):
            txt = txt.lstrip()[len(strip):]
        r.text = "{" + tag + "} " + txt.lstrip()

    def set_text(self, i, text):
        par = self.p(i)
        runs = par.runs
        runs[0].text = text
        for r in runs[1:]:
            r.text = ""

    def cell(self, ti, row, col, tag):
        c = self.t(ti).cell(row, col)
        ps = c.paragraphs
        if ps[0].runs:
            ps[0].runs[0].text = "{" + tag + "}"
            for r in ps[0].runs[1:]:
                r.text = ""
        else:
            ps[0].add_run("{" + tag + "}")
        for extra in ps[1:]:
            extra._element.getparent().remove(extra._element)

    def loop(self, start, end, name):
        """Repeats elements [start, end] once per item of `name`."""
        ref = self.els[start] if self.els[start].tag.endswith("}p") else self.els[start - 1]
        self._marker_at(self.els[start], ref, "{#" + name + "}", before=True)
        self._marker_at(self.els[end], ref, "{/" + name + "}", before=False)

    def _marker_at(self, anchor, ref, text, before):
        new = copy.deepcopy(ref)
        for child in list(new):
            if not child.tag.endswith("}pPr"):
                new.remove(child)
        Paragraph(new, self.doc).add_run(text)
        (anchor.addprevious if before else anchor.addnext)(new)

    def insert_after(self, i, text):
        el = self.els[i]
        ref = el if el.tag.endswith("}p") else self.els[i - 1]
        self._marker_at(el, ref, text, before=False)

    def delete(self, a, b=None):
        for i in range(a, (b if b is not None else a) + 1):
            el = self.els[i]
            el.getparent().remove(el)

    def save(self):
        OUT.mkdir(parents=True, exist_ok=True)
        self.doc.save(OUT / f"{self.name}.docx")
        print("ok", self.name)


# Same keys and order as ELEMENTS in src/lib/permit/schema.ts.
ELEMENTS = [
    "cars", "picture_cars", "vans", "buses", "trucks", "generators",
    "trailers", "mobile_units", "lowboys", "tankers", "heavy_machinery", "motorcycles",
    "cranes", "jibs", "dolly", "tripods", "lighting_grip", "scaffolding", "tents",
    "portable_toilets", "scenery",
]
SPACES = ("road_corridor", "sidewalks", "parks", "plazas", "bridges", "mio", "markets", "natural", "bike_lanes")
CLOSURES = (
    "vehicle_partial_permanent", "vehicle_full_permanent", "vehicle_partial_intermittent", "vehicle_full_intermittent",
    "pedestrian_partial_permanent", "pedestrian_full_permanent", "pedestrian_partial_intermittent", "pedestrian_full_intermittent",
)


def contacts_table(f: Form, ti):
    f.cell(ti, 0, 1, "project_name")
    f.cell(ti, 1, 1, "production_line")
    f.cell(ti, 2, 1, "location_line")


def f004():
    f = Form("F004")
    for base, who in ((5, "production"), (29, "location")):
        f.blanks(base, f"{who}_natural")
        f.blanks(base + 1, f"{who}_legal")
        for k, n in enumerate(("nit", "cc", "passport", "ce")):
            f.blanks(base + 4 + k, f"{who}_{n}")
        f.blanks(base + 9, f"{who}_id_number")
        f.blanks(base + 11, f"{who}_name")
        f.blanks(base + 13, f"{who}_company")
        f.blanks(base + 15, f"{who}_role")
        f.blanks(base + 17, f"{who}_phone")
        f.blanks(base + 19, f"{who}_email")
    for i, n in zip(range(57, 62), ("film", "tv", "advertising", "web", "music_video")):
        f.blanks(i, f"type_{n}")
    f.blanks(62, "type_other")
    f.append(62, "type_other_detail")
    for i, n in zip(range(67, 70), ("short", "medium", "feature")):
        f.blanks(i, f"film_{n}")
    for i, n in zip(range(72, 75), ("series", "telenovela", "reality")):
        f.blanks(i, f"tv_{n}")
    f.blanks(75, "tv_other", "tv_other_detail")
    f.blanks(79, "ad_campaign")
    for i, n in zip(range(83, 87), ("spot", "corporate", "promotional", "social")):
        f.blanks(i, f"ad_{n}")
    f.blanks(87, "ad_other", "ad_other_detail")
    f.blanks(91, "mv_artist")
    f.blanks(93, "mv_song")
    f.blanks(96, "web_type")
    f.blanks(98, "web_name")
    for i, n in zip(range(102, 105), ("national", "international", "services")):
        f.blanks(i, f"origin_{n}")
    f.blanks(106, "project_name")
    f.cell(108, 0, 0, "synopsis")
    f.cell(111, 0, 0, "scenes")
    f.blanks(117, "ex_institution")
    f.blanks(122, "ex_collective")
    f.blanks(127, "ex_fund")
    f.blanks(133, "people_crew")
    f.blanks(135, "people_extras")
    f.blanks(137, "people_crowd")
    for i, n in zip(range(146, 153), ("fire", "rain", "weather_lighting", "gunfire", "compressed_air", "explosions", "other")):
        f.blanks(i, f"fx_{n}")
    f.blanks(153, "fx_other_detail")
    f.cell(157, 0, 0, "fx_description")
    f.blanks(162, "animal_type")
    f.blanks(164, "animal_count")
    f.cell(168, 0, 0, "animal_actions")
    f.cell(172, 0, 0, "animal_handling")
    f.blanks(180, "weapon_types")
    f.blanks(182, "weapon_count")
    f.cell(186, 0, 0, "weapon_actions")
    f.blanks(193, "shoot_days")
    f.blanks(195, "shoot_dates")
    # Day-by-day breakdown: one block per session; the second copy is deleted.
    f.blanks(201, "date")
    f.blanks(203, "address")
    f.blanks(205, "use")
    f.blanks(208, "act_setup")
    f.blanks(209, "act_shoot")
    f.blanks(210, "act_teardown")
    f.blanks(212, "start")
    f.blanks(213, "end")
    f.loop(201, 214, "sessions")
    f.delete(215, 229)
    f.prefix(236, "notify_yes")
    f.blanks(238, "notify_email")
    f.prefix(240, "notify_no")
    f.blanks(246, "signature")
    f.save()


def f005():
    f = Form("F005")
    contacts_table(f, 4)
    f.set_text(11, "Espacio público {n}: {name}")
    f.append(13, "neighborhood")
    f.append(14, "address")
    f.append(15, "maps")
    f.append(16, "dates")
    f.append(17, "schedule")
    f.cell(25, 0, 0, "floor_plan")
    f.append(29, "area_m2", sep=" ")
    for i, n in zip(range(35, 56), ELEMENTS):
        f.blanks(i, f"el_{n}")
    f.append(55, "scenery_notes")
    f.blanks(57, "other_elements")
    f.loop(11, 61, "locations")
    f.save()


def f006():
    f = Form("F006")
    contacts_table(f, 6)
    f.set_text(11, "Espacio público {n}: {name}")
    f.blanks(13, "dates")
    f.blanks(15, "start")
    f.blanks(17, "end")
    f.blanks(22, "use_set")
    f.blanks(23, "use_base")
    f.blanks(27, "zone_urban")
    f.blanks(28, "zone_rural")
    f.blanks(30, "neighborhood")
    f.blanks(32, "address")
    f.cell(35, 0, 0, "place_description")
    for i, n in zip(range(38, 47), SPACES):
        f.blanks(i, f"space_{n}")
    for i, n in zip(range(51, 59), CLOSURES):
        f.blanks(i, f"closure_{n}")
    f.blanks(60, "direction")
    f.blanks(62, "side")
    f.cell(65, 0, 0, "maps")
    f.cell(69, 0, 0, "map_screenshot")
    for i, n in zip(range(75, 96), ELEMENTS):
        f.blanks(i, f"el_{n}")
    f.append(95, "scenery_notes")
    f.blanks(98, "other_elements")
    f.blanks(102, "mio_yes")
    f.blanks(103, "mio_no")
    f.insert_after(114, "Implementación propuesta: {implementation}")
    for (yes, no), n in zip(((117, 118), (120, 121), (123, 124), (126, 127)),
                            ("pedestrian", "transit", "companies", "private")):
        f.blanks(yes, f"{n}_yes")
        f.blanks(no, f"{n}_no")
    f.cell(132, 0, 0, "signage")
    f.insert_after(135, "{loading}")
    f.blanks(140, "lights_yes")
    f.blanks(141, "lights_no")
    f.cell(142, 0, 0, "lights_detail")
    f.cell(146, 0, 0, "parking")
    f.loop(11, 146, "locations")
    f.save()


def f007():
    f = Form("F007")
    contacts_table(f, 8)
    f.cell(8, 3, 1, "applicant_address")
    f.cell(8, 4, 1, "applicant_id")
    f.cell(15, 0, 0, "waste_types")
    f.cell(19, 0, 0, "waste_strategy")
    f.set_text(28, "Nombre del área natural {n}: {area_name}")
    f.blanks(29, "dates")
    f.blanks(30, "start")
    f.blanks(31, "end")
    f.blanks(35, "use_set")
    f.blanks(36, "use_base")
    f.blanks(39, "zone_urban")
    f.blanks(40, "zone_rural")
    f.blanks(42, "neighborhood")
    f.blanks(44, "address")
    f.blanks(46, "area_name")
    f.blanks(49, "maps")
    f.blanks(53, "people_crew")
    f.blanks(55, "people_extras")
    f.blanks(57, "people_crowd")
    f.cell(63, 0, 0, "activities")
    for i, n in zip(range(66, 71), ("light", "sound", "emissions", "vegetation", "water")):
        f.prefix(i, f"imp_{n}", strip="- ")
    f.cell(74, 0, 0, "impact_detail")
    f.loop(28, 83, "areas")
    f.delete(84)
    f.insert_after(26, "{^areas}No aplica: la filmación no usa áreas naturales con importancia ecológica.{/areas}")
    f.blanks(99, "noise_amp_count", "noise_amp_type")
    f.blanks(100, "noise_gen_count", "noise_gen_type")
    f.blanks(101, "noise_veh_count", "noise_veh_type")
    f.blanks(102, "noise_other_type")
    f.blanks(103, "noise_mitigation")
    f.cell(106, 0, 0, "sensitive_sites")
    f.cell(120, 0, 0, "acoustic_measures")
    f.save()


def f008():
    f = Form("F008")
    f.cell(3, 0, 0, "strategies")
    f.cell(7, 0, 0, "positive_impact")
    f.save()


if __name__ == "__main__":
    f004(); f005(); f006(); f007(); f008()
