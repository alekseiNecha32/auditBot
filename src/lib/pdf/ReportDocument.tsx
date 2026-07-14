import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { AuditReport } from "@/lib/types";

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 10, fontFamily: "Helvetica", color: "#111827" },
  meta: { fontSize: 8, color: "#6b7280", marginBottom: 4 },
  title: { fontSize: 20, fontWeight: 700, marginBottom: 16 },
  sectionTitle: { fontSize: 14, fontWeight: 700, marginTop: 20, marginBottom: 8 },
  table: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 4 },
  tableRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#e5e7eb" },
  tableRowLast: { flexDirection: "row" },
  tableHeaderCell: { flex: 1, padding: 6, fontSize: 9, fontWeight: 700, backgroundColor: "#f9fafb" },
  tableCell: { flex: 1, padding: 6, fontSize: 9 },
  metricCell: { flex: 1, padding: 6, fontSize: 9, fontWeight: 700 },
  gapBox: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 4, padding: 10, marginBottom: 10 },
  gapTitle: { fontSize: 11, fontWeight: 700, marginBottom: 4 },
  gapTags: { fontSize: 8, color: "#6b7280", marginBottom: 4 },
  gapEvidence: { fontSize: 9, marginBottom: 6, color: "#374151" },
  step: { fontSize: 9, marginBottom: 2 },
  note: { fontSize: 9, marginBottom: 3, color: "#374151" },
});

export function ReportDocument({ report }: { report: AuditReport }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.meta}>Generated {new Date(report.generatedAt).toLocaleString()}</Text>
        <Text style={styles.title}>
          {report.businessName}
          {report.city ? ` — ${report.city}` : ""}
        </Text>

        <Text style={styles.sectionTitle}>How you compare</Text>
        <View style={styles.table}>
          <View style={styles.tableRow}>
            <Text style={styles.tableHeaderCell}>Metric</Text>
            {report.comparison.businesses.map((name, i) => (
              <Text key={name + i} style={styles.tableHeaderCell}>
                {name}
                {i === 0 ? " (you)" : ""}
              </Text>
            ))}
          </View>
          {report.comparison.rows.map((row, i) => {
            const isLast = i === report.comparison.rows.length - 1;
            return (
              <View key={row.metric + i} style={isLast ? styles.tableRowLast : styles.tableRow}>
                <Text style={styles.metricCell}>{row.metric}</Text>
                {row.values.map((value, j) => (
                  <Text key={j} style={styles.tableCell}>
                    {value}
                  </Text>
                ))}
              </View>
            );
          })}
        </View>

        <Text style={styles.sectionTitle}>Top {report.gaps.length} things to fix</Text>
        {report.gaps
          .slice()
          .sort((a, b) => a.rank - b.rank)
          .map((gap) => (
            <View key={gap.rank} style={styles.gapBox} wrap={false}>
              <Text style={styles.gapTitle}>
                {gap.rank}. {gap.title}
              </Text>
              <Text style={styles.gapTags}>
                {gap.impact} impact · {gap.effort} effort
              </Text>
              <Text style={styles.gapEvidence}>{gap.evidence}</Text>
              {gap.steps.map((step, i) => (
                <Text key={i} style={styles.step}>
                  {i + 1}. {step}
                </Text>
              ))}
            </View>
          ))}

        {report.notes.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Notes</Text>
            {report.notes.map((note, i) => (
              <Text key={i} style={styles.note}>
                • {note}
              </Text>
            ))}
          </>
        )}
      </Page>
    </Document>
  );
}
