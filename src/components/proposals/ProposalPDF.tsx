import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";
import type { Proposal, Company } from "@/types";
import type { AISuggestions } from "@/types";

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#111827",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
    borderBottomWidth: 2,
    borderBottomColor: "#DC2626",
    paddingBottom: 15,
  },
  logo: {
    maxHeight: 48,
    maxWidth: 120,
    objectFit: "contain" as const,
    marginBottom: 6,
  },
  companyName: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    color: "#111827",
  },
  companyDetails: {
    fontSize: 9,
    color: "#6B7280",
    marginTop: 4,
  },
  proposalLabel: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: "#DC2626",
    textAlign: "right" as const,
  },
  proposalNumber: {
    fontSize: 9,
    color: "#6B7280",
    marginTop: 4,
    textAlign: "right" as const,
  },
  section: {
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: "#111827",
    marginBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    paddingBottom: 4,
  },
  infoGrid: {
    flexDirection: "row",
    gap: 30,
    marginBottom: 15,
  },
  infoBlock: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#6B7280",
    textTransform: "uppercase" as const,
    marginBottom: 3,
  },
  infoValue: {
    fontSize: 10,
    color: "#111827",
  },
  bodyText: {
    fontSize: 10,
    color: "#374151",
    lineHeight: 1.5,
  },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    paddingBottom: 4,
    marginBottom: 4,
  },
  tableHeaderText: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#6B7280",
    textTransform: "uppercase" as const,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  totalRow: {
    flexDirection: "row",
    paddingVertical: 8,
    borderTopWidth: 2,
    borderTopColor: "#111827",
    marginTop: 4,
  },
  totalText: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: "#111827",
  },
  colDesc: { flex: 3 },
  colQty: { width: 40, textAlign: "right" as const },
  colUnit: { width: 50, textAlign: "center" as const },
  colPrice: { width: 70, textAlign: "right" as const },
  colTotal: { width: 80, textAlign: "right" as const },
  listItem: {
    fontSize: 10,
    color: "#374151",
    marginBottom: 3,
  },
  footer: {
    position: "absolute" as const,
    bottom: 30,
    left: 40,
    right: 40,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    paddingTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerText: {
    fontSize: 8,
    color: "#9CA3AF",
  },
  signatureSection: {
    marginTop: 20,
    marginBottom: 40,
  },
  signatureGrid: {
    flexDirection: "row",
    gap: 40,
    marginTop: 12,
  },
  signatureColumn: {
    flex: 1,
  },
  signatureColumnLabel: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#6B7280",
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  signatureField: {
    marginBottom: 14,
  },
  signatureLine: {
    borderBottomWidth: 1,
    borderBottomColor: "#9CA3AF",
    height: 20,
    marginBottom: 3,
  },
  signatureFieldLabel: {
    fontSize: 7,
    color: "#9CA3AF",
  },
  signatureNote: {
    fontSize: 8,
    color: "#6B7280",
    marginTop: 4,
    marginBottom: 12,
    lineHeight: 1.4,
  },
});

interface ProposalPDFProps {
  proposal: Proposal;
  company: Company;
}

export default function ProposalPDF({ proposal, company }: ProposalPDFProps) {
  const ai = proposal.ai_suggestions as AISuggestions;
  const lineItems = ai?.line_items || [];

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            {company.logo_url && (
              <Image src={company.logo_url} style={styles.logo} />
            )}
            <Text style={styles.companyName}>{company.name}</Text>
            <Text style={styles.companyDetails}>
              {[company.address, company.city, company.state, company.zip]
                .filter(Boolean)
                .join(", ")}
            </Text>
            {company.phone && (
              <Text style={styles.companyDetails}>{company.phone}</Text>
            )}
            {company.email && (
              <Text style={styles.companyDetails}>{company.email}</Text>
            )}
          </View>
          <View>
            <Text style={styles.proposalLabel}>PROPOSAL</Text>
            <Text style={styles.proposalNumber}>
              {proposal.proposal_number}
            </Text>
            <Text style={styles.proposalNumber}>
              Date: {new Date(proposal.created_at).toLocaleDateString()}
            </Text>
            {proposal.expires_at && (
              <Text style={styles.proposalNumber}>
                Valid Until: {new Date(proposal.expires_at).toLocaleDateString()}
              </Text>
            )}
          </View>
        </View>

        {/* Client & Project */}
        <View style={styles.infoGrid}>
          <View style={styles.infoBlock}>
            <Text style={styles.infoLabel}>Prepared For</Text>
            <Text style={styles.infoValue}>{proposal.client_name}</Text>
            <Text style={styles.infoValue}>{proposal.client_company}</Text>
            {proposal.client_email && (
              <Text style={styles.infoValue}>{proposal.client_email}</Text>
            )}
          </View>
          <View style={styles.infoBlock}>
            <Text style={styles.infoLabel}>Project</Text>
            <Text style={styles.infoValue}>{proposal.project_name}</Text>
            <Text style={styles.infoValue}>{proposal.project_address}</Text>
          </View>
        </View>

        {/* Scope of Work */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Scope of Work</Text>
          <Text style={styles.bodyText}>{proposal.scope_of_work}</Text>
        </View>

        {/* Line Items */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Pricing</Text>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderText, styles.colDesc]}>
              Description
            </Text>
            <Text style={[styles.tableHeaderText, styles.colQty]}>Qty</Text>
            <Text style={[styles.tableHeaderText, styles.colUnit]}>Unit</Text>
            <Text style={[styles.tableHeaderText, styles.colPrice]}>
              Unit Price
            </Text>
            <Text style={[styles.tableHeaderText, styles.colTotal]}>
              Total
            </Text>
          </View>
          {lineItems.map((item, i) => (
            <View key={i} style={styles.tableRow}>
              <Text style={[styles.bodyText, styles.colDesc]}>
                {item.description}
              </Text>
              <Text style={[styles.bodyText, styles.colQty]}>
                {item.quantity}
              </Text>
              <Text style={[styles.bodyText, styles.colUnit]}>
                {item.unit}
              </Text>
              <Text style={[styles.bodyText, styles.colPrice]}>
                ${item.unit_price.toLocaleString()}
              </Text>
              <Text style={[styles.bodyText, styles.colTotal]}>
                ${item.total_price.toLocaleString()}
              </Text>
            </View>
          ))}
          <View style={styles.totalRow}>
            <Text style={[styles.totalText, styles.colDesc]} />
            <Text style={[styles.totalText, styles.colQty]} />
            <Text style={[styles.totalText, styles.colUnit]} />
            <Text style={[styles.totalText, styles.colPrice]}>Total:</Text>
            <Text style={[styles.totalText, styles.colTotal]}>
              ${(proposal.total_amount || 0).toLocaleString()}
            </Text>
          </View>
        </View>

        {/* Inclusions / Exclusions */}
        <View style={styles.infoGrid}>
          <View style={[styles.section, { flex: 1 }]}>
            <Text style={styles.sectionTitle}>Inclusions</Text>
            {(proposal.inclusions || "")
              .split("\n")
              .filter(Boolean)
              .map((item, i) => (
                <Text key={i} style={styles.listItem}>
                  • {item}
                </Text>
              ))}
          </View>
          <View style={[styles.section, { flex: 1 }]}>
            <Text style={styles.sectionTitle}>Exclusions</Text>
            {(proposal.exclusions || "")
              .split("\n")
              .filter(Boolean)
              .map((item, i) => (
                <Text key={i} style={styles.listItem}>
                  • {item}
                </Text>
              ))}
          </View>
        </View>

        {/* Timeline */}
        {proposal.timeline_description && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Timeline</Text>
            <Text style={styles.bodyText}>
              {proposal.timeline_description}
            </Text>
          </View>
        )}

        {/* Terms */}
        <View style={styles.infoGrid}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionTitle}>Payment Terms</Text>
            <Text style={styles.bodyText}>{proposal.payment_terms}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionTitle}>Warranty</Text>
            <Text style={styles.bodyText}>{proposal.warranty_terms}</Text>
          </View>
        </View>

        {/* Certifications */}
        {company.certifications.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Certifications</Text>
            <Text style={styles.bodyText}>
              {company.certifications.join(" | ")}
            </Text>
          </View>
        )}

        {/* Signature / Acceptance Block */}
        <View style={styles.signatureSection}>
          <Text style={styles.sectionTitle}>Authorization &amp; Acceptance</Text>
          <Text style={styles.signatureNote}>
            By signing below, both parties agree to the scope, pricing, and terms outlined in this proposal.
            {proposal.expires_at
              ? ` This proposal is valid until ${new Date(proposal.expires_at).toLocaleDateString()}.`
              : ""}
          </Text>
          <View style={styles.signatureGrid}>
            {/* Client column */}
            <View style={styles.signatureColumn}>
              <Text style={styles.signatureColumnLabel}>
                Client / Authorized Representative
              </Text>
              {(["Printed Name", "Title", "Signature", "Date"] as const).map((label) => (
                <View key={label} style={styles.signatureField}>
                  <View style={styles.signatureLine} />
                  <Text style={styles.signatureFieldLabel}>{label}</Text>
                </View>
              ))}
            </View>
            {/* Contractor column */}
            <View style={styles.signatureColumn}>
              <Text style={styles.signatureColumnLabel}>
                Contractor — {company.name}
              </Text>
              {(["Printed Name", "Title", "Signature", "Date"] as const).map((label) => (
                <View key={label} style={styles.signatureField}>
                  <View style={styles.signatureLine} />
                  <Text style={styles.signatureFieldLabel}>{label}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>{company.name}</Text>
          <Text style={styles.footerText}>
            Generated by Bid Assassin
          </Text>
        </View>
      </Page>
    </Document>
  );
}
