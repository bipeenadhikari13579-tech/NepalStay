import { FileText } from 'lucide-react'

/** Shows one stored KYC document: the photo itself, or a link for a PDF. */
export default function KycFile({ label, file, src }) {
  if (!file?.file) {
    return (
      <figure className="kyc-file is-empty">
        <span>Not provided</span>
        <figcaption>{label}</figcaption>
      </figure>
    )
  }
  return (
    <figure className="kyc-file">
      <a href={src} target="_blank" rel="noreferrer" title="Open full size">
        {file.type === 'application/pdf' ? (
          <span className="kyc-file__pdf">
            <FileText size={28} /> Open PDF
          </span>
        ) : (
          <img src={src} alt={label} loading="lazy" />
        )}
      </a>
      <figcaption>{label}</figcaption>
    </figure>
  )
}
