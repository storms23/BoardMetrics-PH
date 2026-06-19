import Image from "next/image";
import logoImage from "@/app/image/Logo.png";

export function SiteLogo({ size = "md" }: { size?: "sm" | "md" }) {
  const height = size === "sm" ? 36 : 47;

  return (
    <Image
      src={logoImage}
      alt="Pasa Rate PH"
      height={height}
      width={height}
      className="h-[42px] w-auto object-contain sm:h-[47px]"
      priority
    />
  );
}
