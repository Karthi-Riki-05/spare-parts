export default function DocsPage() {
  return (
    <main className="max-w-[800px] mx-auto px-4 py-8">
      <a href="/" className="text-brand-cyan text-sm hover:underline mb-6 inline-block">
        &larr; Back to Verifier
      </a>

      <h2 className="text-2xl font-bold text-slate-200 mb-6">Documentation</h2>

      <section className="mb-8">
        <h3 className="text-base font-semibold text-brand-cyan mb-3">How It Works</h3>
        <ol className="list-decimal pl-5 space-y-2 text-sm text-text-primary">
          <li>Upload an Excel file (.xlsx) containing spare parts data</li>
          <li>The system auto-detects the format (A = correct, B = messy single-column, C = incomplete)</li>
          <li>Data is normalized and cleaned using AI (GPT-4o-mini)</li>
          <li>Each part is verified against manufacturer websites using Gemini with Google Search</li>
          <li>Low-confidence results get a second pass with Claude for rule enforcement</li>
          <li>Download the verified Excel with scores, URLs, and original data preserved</li>
        </ol>
      </section>

      <section className="mb-8">
        <h3 className="text-base font-semibold text-brand-cyan mb-3">Output Columns</h3>
        <table className="w-full border-collapse text-[13px] mb-6">
          <thead>
            <tr>
              <th className="bg-bg-card px-3 py-2 text-left text-[11px] uppercase tracking-wider text-text-muted">Column</th>
              <th className="bg-bg-card px-3 py-2 text-left text-[11px] uppercase tracking-wider text-text-muted">Description</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Internal Item #', 'Your internal reference (never sent to AI)'],
              ['Description', 'Part description (translated from Swedish if needed)'],
              ['Manufacturer', 'Brand name (inferred if empty)'],
              ['Item Number', 'Primary part number'],
              ['Type Designation', 'Secondary identifier (deduplicated with Item Number)'],
              ['Supplementary', 'Extra data — specs or internal notes'],
              ['Verified Source', 'Where the part was found'],
              ['Score', 'Confidence score 0–100'],
              ['Website ID', 'Direct URL to product page'],
              ['Source Type', 'official / external / inferred / not_found'],
            ].map(([col, desc]) => (
              <tr key={col} className="border-b border-border">
                <td className="px-3 py-2 font-medium">{col}</td>
                <td className="px-3 py-2 text-text-muted">{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mb-8">
        <h3 className="text-base font-semibold text-brand-cyan mb-3">Score Guide</h3>
        <div className="space-y-1 text-sm">
          <p><span className="score-hi font-semibold">90–100:</span> Confirmed on manufacturer&apos;s official website</p>
          <p><span className="score-md font-semibold">70–89:</span> Found on distributor site</p>
          <p><span className="score-lo font-semibold">50–69:</span> Inferred — not confirmed on a live page</p>
          <p><span className="score-vl font-semibold">Below 50:</span> Uncertain — manual review recommended</p>
        </div>
      </section>

      <section className="mb-8">
        <h3 className="text-base font-semibold text-brand-cyan mb-3">Supported Formats</h3>
        <ul className="list-disc pl-5 space-y-1 text-sm text-text-primary">
          <li><strong className="text-brand-green">Format A:</strong> Data in separate columns — Description, Manufacturer, Item Number, etc.</li>
          <li><strong className="text-brand-orange">Format B:</strong> All data in one column, possibly Swedish text</li>
          <li><strong className="text-brand-cyan">Format C:</strong> Incomplete — missing manufacturer or only one item number field</li>
        </ul>
      </section>
    </main>
  );
}
