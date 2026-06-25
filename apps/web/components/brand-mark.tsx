import Image from "next/image";

type BrandMarkProps = {
  readonly className?: string;
  readonly framed?: boolean;
  readonly imageClassName?: string;
  readonly priority?: boolean;
};

export function BrandMark({ className = "", framed = false, imageClassName = "", priority = false }: BrandMarkProps) {
  const frameClass = framed ? "overflow-hidden rounded-lg border border-emerald-400/35 bg-[#141716]" : "";
  const imageSizeClass = framed ? "size-[82%]" : "size-full";

  return (
    <span
      className={`grid size-9 shrink-0 place-items-center ${frameClass} ${className}`}
      aria-hidden="true"
    >
      <Image
        src="/brand/aigentra-nukki.png"
        alt=""
        width={36}
        height={36}
        priority={priority}
        className={`${imageSizeClass} object-contain ${imageClassName}`}
      />
    </span>
  );
}
