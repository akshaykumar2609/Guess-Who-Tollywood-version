import React from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const styles: Record<Variant, string> = {
  primary:
    "bg-tolly-red hover:bg-red-700 text-white shadow-lg shadow-red-900/30",
  secondary: "bg-tolly-gold hover:bg-yellow-500 text-tolly-ink font-semibold",
  ghost: "bg-transparent hover:bg-white/10 text-tolly-muted border border-white/10",
  danger: "bg-red-900/60 hover:bg-red-900 text-red-100 border border-red-500/40",
};

export default function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      className={`rounded-xl px-4 py-2.5 text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed ${styles[variant]} ${className}`}
    />
  );
}
