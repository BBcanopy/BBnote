import { useEffect, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { fetchAttachmentBlob } from "../api/client";

export function MarkdownPreview(props: { bodyMarkdown: string; token: string }) {
  return (
    <div className="prose prose-slate max-w-none prose-headings:tracking-tight prose-img:rounded-[1rem]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          img: ({ src, alt }) => <SecureAttachmentImage src={src} alt={alt ?? ""} token={props.token} />,
          a: ({ href, children }) => (
            <SecureAttachmentLink href={href} token={props.token}>
              {children}
            </SecureAttachmentLink>
          )
        }}
      >
        {props.bodyMarkdown}
      </ReactMarkdown>
    </div>
  );
}

function SecureAttachmentImage(props: { src?: string; alt: string; token: string }) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let currentObjectUrl: string | null = null;

    if (!props.src || !props.src.startsWith("/api/v1/attachments/")) {
      setObjectUrl(props.src ?? null);
      return () => undefined;
    }

    fetchAttachmentBlob(props.token, props.src)
      .then((blob) => {
        if (!active) {
          return;
        }
        currentObjectUrl = URL.createObjectURL(blob);
        setObjectUrl(currentObjectUrl);
      })
      .catch(() => {
        setObjectUrl(null);
      });

    return () => {
      active = false;
      if (currentObjectUrl) {
        URL.revokeObjectURL(currentObjectUrl);
      }
    };
  }, [props.src, props.token]);

  if (!objectUrl) {
    return <span className="text-sm text-slate-400">Attachment preview unavailable.</span>;
  }

  return <img src={objectUrl} alt={props.alt} />;
}

function SecureAttachmentLink(props: { href?: string; token: string; children: ReactNode }) {
  if (!props.href || !props.href.startsWith("/api/v1/attachments/")) {
    return (
      <a href={props.href} target="_blank" rel="noreferrer">
        {props.children}
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={async () => {
        const blob = await fetchAttachmentBlob(props.token, props.href!);
        const objectUrl = URL.createObjectURL(blob);
        window.open(objectUrl, "_blank", "noopener,noreferrer");
        setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      }}
      className="text-emerald-700 underline"
    >
      {props.children}
    </button>
  );
}
