// The excuse letter (German, A4). Signed afterwards with ID Austria, so the end of the page stays empty.

import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { formatDate, formatDay, formatRange, formatUnits } from "./format";
import type { Absence } from "./model";

export type LetterDay = { date: string; reason: string; absences: Absence[] };
export type Letter = { name: string; klasse: string; place: string; date: string; days: LetterDay[] };

const s = StyleSheet.create({
  page: { paddingTop: 56, paddingHorizontal: 56, paddingBottom: 56, fontFamily: "Helvetica", fontSize: 10.5, lineHeight: 1.4 },
  head: { flexDirection: "row", justifyContent: "space-between" },
  bold: { fontFamily: "Helvetica-Bold" },
  title: { fontFamily: "Helvetica-Bold", fontSize: 16, marginTop: 36, marginBottom: 12 },
  table: { marginTop: 14, borderTopWidth: 1, borderColor: "#999" },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderColor: "#bbb", paddingVertical: 5 },
  th: { fontFamily: "Helvetica-Bold", fontSize: 9.5 },
  cDate: { width: "22%", paddingRight: 6 },
  cTime: { width: "22%", paddingRight: 6 },
  cUnits: { width: "20%", paddingRight: 6 },
  cReason: { width: "36%" },
  small: { fontSize: 9, color: "#444" },
  closing: { marginTop: 28 },
  // Room for the ID Austria signature block.
  signature: { height: 140 },
});

function Row({ day }: { day: LetterDay }) {
  return (
    <View style={s.row} wrap={false}>
      <Text style={s.cDate}>{formatDay(day.date)}</Text>
      <View style={s.cTime}>
        {day.absences.map((a) => (
          <View key={a.id}>
            <Text>{formatRange(a.start, a.end)}</Text>
            {a.late && <Text style={s.small}>Verspätung, {a.lateMinutes} Min.</Text>}
            {!a.late && a.lateMinutes > 0 && <Text style={s.small}>davon {a.lateMinutes} Min. Verspätung</Text>}
          </View>
        ))}
      </View>
      <View style={s.cUnits}>
        {day.absences.map((a) => (
          <Text key={a.id}>{formatUnits(a.units) || "-"}</Text>
        ))}
      </View>
      <Text style={s.cReason}>{day.reason}</Text>
    </View>
  );
}

function LetterDoc({ letter }: { letter: Letter }) {
  const many = letter.days.length > 1;
  return (
    <Document title={`Entschuldigung ${letter.name}`} author={letter.name} language="de-AT">
      <Page size="A4" style={s.page}>
        <View style={s.head}>
          <View>
            <Text style={s.bold}>{letter.name}</Text>
            <Text>Klasse {letter.klasse}</Text>
          </View>
          <Text>
            {letter.place ? `${letter.place}, am` : "Am"} {formatDate(letter.date)}
          </Text>
        </View>

        <Text style={s.title}>Entschuldigung</Text>
        <Text>
          Hiermit entschuldige ich mein Fernbleiben vom Unterricht {many ? "an den folgenden Tagen" : "am folgenden Tag"}:
        </Text>

        <View style={s.table}>
          <View style={s.row} fixed>
            <Text style={[s.th, s.cDate]}>Datum</Text>
            <Text style={[s.th, s.cTime]}>Uhrzeit</Text>
            <Text style={[s.th, s.cUnits]}>Stunden</Text>
            <Text style={[s.th, s.cReason]}>Grund</Text>
          </View>
          {letter.days.map((d) => (
            <Row key={d.date} day={d} />
          ))}
        </View>

        <View wrap={false}>
          <Text style={s.closing}>Mit freundlichen Grüßen</Text>
          <Text style={{ marginTop: 4 }}>{letter.name}</Text>
          <View style={s.signature} />
        </View>
      </Page>
    </Document>
  );
}

export function renderLetter(letter: Letter) {
  return renderToBuffer(<LetterDoc letter={letter} />);
}
