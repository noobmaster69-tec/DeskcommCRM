"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Slider com a API do shadcn/ui (`value: number[]`, `onValueChange`, `min`,
 * `max`, `step`) — fork jhoow. Sem `@radix-ui/react-slider`: o projeto não tem
 * a dependência e um controle de um polegar só não precisa dela; por baixo é o
 * `<input type="range">` nativo, acessível de graça (teclado, leitor de tela).
 * Trocar por Radix depois não muda quem usa.
 */
export interface SliderProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "defaultValue" | "onChange" | "type" | "min" | "max" | "step"> {
  value: number[];
  onValueChange: (value: number[]) => void;
  min?: number;
  max?: number;
  step?: number;
}

export const Slider = React.forwardRef<HTMLInputElement, SliderProps>(
  ({ value, onValueChange, min = 0, max = 100, step = 1, className, style, ...props }, ref) => {
    const atual = value[0] ?? min;
    const pct = max > min ? ((atual - min) / (max - min)) * 100 : 0;
    return (
      <input
        ref={ref}
        type="range"
        min={min}
        max={max}
        step={step}
        value={atual}
        onChange={(e) => onValueChange([Number(e.target.value)])}
        className={cn(
          "h-2 w-full cursor-pointer appearance-none rounded-full bg-surface-elevated accent-accent-500 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        // A parte preenchida da trilha (o navegador só pinta a do Firefox).
        style={{
          background: `linear-gradient(to right, var(--color-accent-500, currentColor) ${pct}%, var(--color-border, transparent) ${pct}%)`,
          ...style,
        }}
        {...props}
      />
    );
  },
);
Slider.displayName = "Slider";
