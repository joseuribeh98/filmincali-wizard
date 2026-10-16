"""Convierte los formatos oficiales (tools/originales) en plantillas docxtemplater.

Solo toca lo que el formato pide llenar: las líneas ____, las casillas __ y las
cajas de texto vacías. Los bloques que el formato dice "copie y pegue cuantas
veces sea necesario" se envuelven en un bucle. El resto del documento
(encabezado, pie, textos legales) queda intacto.

Uso: python3 tools/plantillas.py
"""
import copy
import re
from pathlib import Path

import docx
from docx.table import Table
from docx.text.paragraph import Paragraph

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "originales"
OUT = ROOT.parent / "public" / "plantillas"
BLANK = re.compile(r"_{2,}")


class Form:
    def __init__(self, name):
        self.name = name
        self.doc = docx.Document(SRC / f"{name}.docx")
        # Referencias fijas a los elementos del cuerpo por su índice original.
        self.els = list(self.doc.element.body.iterchildren())

    def p(self, i) -> Paragraph:
        el = self.els[i]
        assert el.tag.endswith("}p"), f"{self.name}[{i}] no es párrafo"
        return Paragraph(el, self.doc)

    def t(self, i) -> Table:
        el = self.els[i]
        assert el.tag.endswith("}tbl"), f"{self.name}[{i}] no es tabla"
        return Table(el, self.doc)

    # --- operaciones -----------------------------------------------------
    def blanks(self, i, *tags):
        """Reemplaza, en orden, cada grupo de guiones bajos por un tag."""
        par = self.p(i)
        pending = list(tags)
        for run in par.runs:
            def sub(m):
                if not pending:
                    return ""
                tag = "{" + pending.pop(0) + "}"
                before = m.string[m.start() - 1] if m.start() > 0 else " "
                return (" " + tag) if not before.isspace() and before not in "(" else tag
            run.text = BLANK.sub(sub, run.text)
        assert not pending, f"{self.name}[{i}] sobran tags {pending}: {par.text!r}"

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
        """Repite los elementos [start, end] una vez por item de `name`."""
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


def cb(prefix_, *names):
    return [f"{prefix_}_{n}" for n in names]


ELEMENTOS = [
    "automoviles", "automoviles_escena", "vanes", "buses", "camiones", "plantas",
    "trailers", "moviles", "camabajas", "carrotanques", "maquinaria", "motos",
    "gruas", "brazos", "dolly", "tripodes", "luminotecnia", "andamios", "carpas",
    "banos", "escenografia",
]


def responsables_tabla(f: Form, ti):
    f.cell(ti, 0, 1, "proyecto_nombre")
    f.cell(ti, 1, 1, "resp1_linea")
    f.cell(ti, 2, 1, "resp2_linea")


def f004():
    f = Form("F004")
    for base, r in ((5, "r1"), (29, "r2")):
        f.blanks(base, f"{r}_natural")
        f.blanks(base + 1, f"{r}_juridica")
        for k, n in enumerate(("nit", "cc", "pasaporte", "ce")):
            f.blanks(base + 4 + k, f"{r}_{n}")
        f.blanks(base + 9, f"{r}_documento")
        f.blanks(base + 11, f"{r}_nombre")
        f.blanks(base + 13, f"{r}_empresa")
        f.blanks(base + 15, f"{r}_cargo")
        f.blanks(base + 17, f"{r}_telefono")
        f.blanks(base + 19, f"{r}_correo")
    for i, n in zip(range(57, 62), ("cine", "tv", "publicidad", "web", "videoclip")):
        f.blanks(i, f"tipo_{n}")
    f.blanks(62, "tipo_otro")
    f.append(62, "tipo_otro_cual")
    for i, n in zip(range(67, 70), ("corto", "medio", "largo")):
        f.blanks(i, f"cine_{n}")
    for i, n in zip(range(72, 75), ("serie", "telenovela", "reality")):
        f.blanks(i, f"tv_{n}")
    f.blanks(75, "tv_otro", "tv_otro_cual")
    f.blanks(79, "pub_campana")
    for i, n in zip(range(83, 87), ("spot", "corporativo", "promocional", "redes")):
        f.blanks(i, f"pub_{n}")
    f.blanks(87, "pub_otro", "pub_otro_cual")
    f.blanks(91, "vc_artista")
    f.blanks(93, "vc_cancion")
    f.blanks(96, "web_tipo")
    f.blanks(98, "web_nombre")
    for i, n in zip(range(102, 105), ("nacional", "internacional", "servicios")):
        f.blanks(i, f"nat_{n}")
    f.blanks(106, "proyecto_nombre")
    f.cell(108, 0, 0, "sinopsis")
    f.cell(111, 0, 0, "escenas")
    f.blanks(117, "ex_institucion")
    f.blanks(122, "ex_colectivo")
    f.blanks(127, "ex_fondo")
    f.blanks(133, "personas_equipo")
    f.blanks(135, "personas_extras")
    f.blanks(137, "personas_aglomeracion")
    for i, n in zip(range(146, 153), ("fuego", "lluvia", "luminicos", "disparos", "aire", "explosiones", "otro")):
        f.blanks(i, f"fx_{n}")
    f.blanks(153, "fx_otro_cual")
    f.cell(157, 0, 0, "fx_escena")
    f.blanks(162, "an_tipo")
    f.blanks(164, "an_cantidad")
    f.cell(168, 0, 0, "an_acciones")
    f.cell(172, 0, 0, "an_manejo")
    f.blanks(180, "ar_tipos")
    f.blanks(182, "ar_cantidad")
    f.cell(186, 0, 0, "ar_acciones")
    f.blanks(193, "rodaje_dias")
    f.blanks(195, "rodaje_fechas")
    # Desglose por día: un bloque por jornada; se borra la segunda copia.
    f.blanks(201, "fecha")
    f.blanks(203, "direccion")
    f.blanks(205, "uso")
    f.blanks(208, "act_montaje")
    f.blanks(209, "act_filmacion")
    f.blanks(210, "act_desmontaje")
    f.blanks(212, "hora_inicio")
    f.blanks(213, "hora_fin")
    f.loop(201, 214, "jornadas")
    f.delete(215, 229)
    f.prefix(236, "notif_si")
    f.blanks(238, "notif_correo")
    f.prefix(240, "notif_no")
    f.blanks(246, "firma")
    f.save()


def f005():
    f = Form("F005")
    responsables_tabla(f, 4)
    f.set_text(11, "Espacio público {n}: {nombre}")
    f.append(13, "barrio")
    f.append(14, "direccion")
    f.append(15, "maps")
    f.append(16, "fechas")
    f.append(17, "horario")
    f.cell(25, 0, 0, "plano")
    f.append(29, "area_m2", sep=" ")
    for i, n in zip(range(35, 56), ELEMENTOS):
        f.blanks(i, f"el_{n}")
    f.append(55, "escenografia_desc")
    f.blanks(57, "otros_elementos")
    f.loop(11, 61, "locaciones")
    f.save()


def f006():
    f = Form("F006")
    responsables_tabla(f, 6)
    f.set_text(11, "Espacio público {n}: {nombre}")
    f.blanks(13, "fechas")
    f.blanks(15, "hora_inicio")
    f.blanks(17, "hora_fin")
    f.blanks(22, "uso_set")
    f.blanks(23, "uso_base")
    f.blanks(27, "zona_urbano")
    f.blanks(28, "zona_rural")
    f.blanks(30, "barrio")
    f.blanks(32, "direccion")
    f.cell(35, 0, 0, "descripcion_lugar")
    for i, n in zip(range(38, 47), ("corredor_vial", "andenes", "parques", "alamedas", "puentes", "mio", "plazas_mercado", "natural", "ciclorrutas")):
        f.blanks(i, f"esp_{n}")
    afect = ("veh_parcial_perm", "veh_total_perm", "veh_parcial_inter", "veh_total_inter",
             "pea_parcial_perm", "pea_total_perm", "pea_parcial_inter", "pea_total_inter")
    for i, n in zip(range(51, 59), afect):
        f.blanks(i, f"af_{n}")
    f.blanks(60, "sentido")
    f.blanks(62, "costado")
    f.cell(65, 0, 0, "maps")
    f.cell(69, 0, 0, "esquema")
    for i, n in zip(range(75, 96), ELEMENTOS):
        f.blanks(i, f"el_{n}")
    f.append(95, "escenografia_desc")
    f.blanks(98, "otros_elementos")
    f.blanks(102, "mio_si")
    f.blanks(103, "mio_no")
    f.insert_after(114, "Implementación propuesta: {implementacion}")
    for (si, no), n in zip(((117, 118), (120, 121), (123, 124), (126, 127)),
                           ("peatonal", "publico", "socializar", "particular")):
        f.blanks(si, f"{n}_si")
        f.blanks(no, f"{n}_no")
    f.cell(132, 0, 0, "senalizacion")
    f.insert_after(135, "{cargue}")
    f.blanks(140, "semaforos_si")
    f.blanks(141, "semaforos_no")
    f.cell(142, 0, 0, "semaforos_detalle")
    f.cell(146, 0, 0, "parqueo")
    f.loop(11, 146, "locaciones")
    f.save()


def f007():
    f = Form("F007")
    responsables_tabla(f, 8)
    f.cell(8, 3, 1, "solicitante_direccion")
    f.cell(8, 4, 1, "solicitante_documento")
    f.cell(15, 0, 0, "residuos_tipos")
    f.cell(19, 0, 0, "residuos_estrategia")
    f.set_text(28, "Nombre del área natural {n}: {nombre_area}")
    f.blanks(29, "fechas")
    f.blanks(30, "hora_inicio")
    f.blanks(31, "hora_fin")
    f.blanks(35, "uso_set")
    f.blanks(36, "uso_base")
    f.blanks(39, "zona_urbano")
    f.blanks(40, "zona_rural")
    f.blanks(42, "barrio")
    f.blanks(44, "direccion")
    f.blanks(46, "nombre_area")
    f.blanks(49, "maps")
    f.blanks(53, "personas_equipo")
    f.blanks(55, "personas_extras")
    f.blanks(57, "personas_aglomeracion")
    f.cell(63, 0, 0, "actividades")
    for i, n in zip(range(66, 71), ("luz", "sonido", "gases", "vegetacion", "agua")):
        f.prefix(i, f"imp_{n}", strip="- ")
    f.cell(74, 0, 0, "impacto_detalle")
    f.loop(28, 83, "areas")
    f.delete(84)
    f.insert_after(26, "{^areas}No aplica: la filmación no usa áreas naturales con importancia ecológica.{/areas}")
    f.blanks(99, "ruido_amp_cantidad", "ruido_amp_tipo")
    f.blanks(100, "ruido_plantas_cantidad", "ruido_plantas_tipo")
    f.blanks(101, "ruido_veh_cantidad", "ruido_veh_tipo")
    f.blanks(102, "ruido_otro_tipo")
    f.blanks(103, "ruido_mitigacion")
    f.cell(106, 0, 0, "sensibles")
    f.cell(120, 0, 0, "medidas_acusticas")
    f.save()


def f008():
    f = Form("F008")
    f.cell(3, 0, 0, "estrategias")
    f.cell(7, 0, 0, "impacto_positivo")
    f.save()


if __name__ == "__main__":
    f004(); f005(); f006(); f007(); f008()
