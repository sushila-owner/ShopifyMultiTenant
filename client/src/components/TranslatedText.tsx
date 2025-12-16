// Simplified TranslatedText component - English only
// Just renders text as-is without translation

interface TranslatedTextProps {
  text: string | undefined | null;
  className?: string;
  showLoading?: boolean;
  as?: keyof JSX.IntrinsicElements;
}

export function TranslatedText({ 
  text, 
  className = "", 
  as: Component = "span" 
}: TranslatedTextProps) {
  if (!text) {
    return null;
  }

  return <Component className={className}>{text}</Component>;
}

interface TranslatedHtmlProps {
  html: string | undefined | null;
  className?: string;
}

export function TranslatedHtml({ html, className = "" }: TranslatedHtmlProps) {
  if (!html) {
    return null;
  }

  return (
    <div 
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export default TranslatedText;
