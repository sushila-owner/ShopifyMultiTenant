import { useTranslateText } from "@/hooks/useTranslation";
import { Skeleton } from "@/components/ui/skeleton";

interface TranslatedTextProps {
  text: string | undefined | null;
  className?: string;
  showLoading?: boolean;
  as?: keyof JSX.IntrinsicElements;
}

export function TranslatedText({ 
  text, 
  className = "", 
  showLoading = false,
  as: Component = "span" 
}: TranslatedTextProps) {
  const { text: translatedText, isLoading } = useTranslateText(text);

  if (!text) {
    return null;
  }

  if (showLoading && isLoading) {
    return <Skeleton className={`h-4 w-32 ${className}`} />;
  }

  return <Component className={className}>{translatedText}</Component>;
}

interface TranslatedHtmlProps {
  html: string | undefined | null;
  className?: string;
}

export function TranslatedHtml({ html, className = "" }: TranslatedHtmlProps) {
  const { text: translatedHtml, isLoading } = useTranslateText(html);

  if (!html) {
    return null;
  }

  if (isLoading) {
    return (
      <div className={className}>
        <Skeleton className="h-4 w-full mb-2" />
        <Skeleton className="h-4 w-3/4 mb-2" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    );
  }

  return (
    <div 
      className={className}
      dangerouslySetInnerHTML={{ __html: translatedHtml }}
    />
  );
}

export default TranslatedText;
