import type { Metadata } from "next";
import Script from "next/script";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: "Coach CV Romania",
  description: "Coach conversational pentru CV-uri adaptate rolurilor tinta."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ro" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <Script id="extension-hydration-cleanup" strategy="beforeInteractive">
          {`
            (function () {
              var extensionAttributes = [
                "bis_skin_checked",
                "data-new-gr-c-s-check-loaded",
                "data-gr-ext-installed",
                "data-gr-ext-disabled",
                "data-lt-installed",
                "data-gramm",
                "data-gramm_editor",
                "data-gramm_id"
              ];
              var selector = extensionAttributes.map(function (name) {
                return "[" + name + "]";
              }).join(",");

              function cleanElement(element) {
                if (!element || element.nodeType !== 1) return;
                extensionAttributes.forEach(function (name) {
                  if (element.hasAttribute(name)) element.removeAttribute(name);
                });
              }

              function cleanTree(root) {
                cleanElement(root);
                if (root && root.querySelectorAll) {
                  root.querySelectorAll(selector).forEach(cleanElement);
                }
              }

              cleanTree(document.documentElement);

              var observer = new MutationObserver(function (mutations) {
                mutations.forEach(function (mutation) {
                  if (mutation.type === "attributes") {
                    cleanElement(mutation.target);
                  }
                  mutation.addedNodes.forEach(cleanTree);
                });
              });

              observer.observe(document.documentElement, {
                attributes: true,
                childList: true,
                subtree: true
              });

              window.setTimeout(function () {
                observer.disconnect();
                cleanTree(document.documentElement);
              }, 8000);
            })();
          `}
        </Script>
        {children}
      </body>
    </html>
  );
}
