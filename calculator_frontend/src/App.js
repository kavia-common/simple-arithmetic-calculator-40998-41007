import React, { useCallback, useEffect, useMemo, useState } from "react";
import "./App.css";
import { getOrCreateSessionId, insertCalculation } from "./lib/calculations";

/**
 * Ocean Professional theme tokens (lightly applied inline to keep the feature self-contained in App.js)
 */
const THEME = {
  background: "#f9fafb",
  surface: "#ffffff",
  text: "#111827",
  mutedText: "#6b7280",
  border: "rgba(17, 24, 39, 0.10)",
  primary: "#2563EB",
  secondary: "#F59E0B",
  error: "#EF4444",
};

const MAX_DISPLAY_LEN = 18;

function formatDisplay(value) {
  if (value === "Cannot divide by zero") return value;
  if (value === "Error") return value;

  // Keep as string; avoid scientific notation surprises for typical calculator usage.
  // If it's a number string, trim trailing zeros safely when needed.
  const s = String(value);

  if (s.length <= MAX_DISPLAY_LEN) return s;

  // If it's numeric, try to shorten.
  const n = Number(s);
  if (!Number.isFinite(n)) return "Error";

  // Use precision to fit within display length.
  const precision = Math.max(1, MAX_DISPLAY_LEN - 2);
  return n.toPrecision(precision);
}

function isDigit(key) {
  return key.length === 1 && key >= "0" && key <= "9";
}

function normalizeOperator(op) {
  // Support various symbols from keyboard/UI
  if (op === "×" || op === "*") return "*";
  if (op === "÷" || op === "/") return "/";
  if (op === "+") return "+";
  if (op === "-") return "-";
  if (op === "%") return "%";
  return null;
}

function prettyOperator(op) {
  if (op === "*") return "×";
  if (op === "/") return "÷";
  return op;
}

// PUBLIC_INTERFACE
function App() {
  /**
   * currentValue: string representing what's currently on screen (editable input)
   * previousValue: string|null representing stored operand for pending operation
   * operator: one of "+", "-", "*", "/", "%" or null
   * overwrite: when true, next digit replaces currentValue (e.g., after equals or operator selection)
   */
  const [currentValue, setCurrentValue] = useState("0");
  const [previousValue, setPreviousValue] = useState(null);
  const [operator, setOperator] = useState(null);
  const [overwrite, setOverwrite] = useState(true);

  const hasError = currentValue === "Cannot divide by zero" || currentValue === "Error";

  const display = useMemo(() => formatDisplay(currentValue), [currentValue]);
  const expressionPreview = useMemo(() => {
    if (previousValue == null || operator == null) return null;
    return `${formatDisplay(previousValue)} ${prettyOperator(operator)}`;
  }, [previousValue, operator]);

  const clearAll = useCallback(() => {
    setCurrentValue("0");
    setPreviousValue(null);
    setOperator(null);
    setOverwrite(true);
  }, []);

  const backspace = useCallback(() => {
    if (hasError) {
      clearAll();
      return;
    }

    // If we're in overwrite mode (e.g., right after equals), backspace should act as clear to "0".
    if (overwrite) {
      setCurrentValue("0");
      setOverwrite(true);
      return;
    }

    setCurrentValue((prev) => {
      if (prev.length <= 1) return "0";
      // Handle negative single digit "-5" -> "0"
      if (prev.length === 2 && prev.startsWith("-")) return "0";
      return prev.slice(0, -1);
    });
  }, [clearAll, hasError, overwrite]);

  const inputDigit = useCallback(
    (digit) => {
      if (hasError) {
        // Start fresh after error
        setCurrentValue(digit);
        setPreviousValue(null);
        setOperator(null);
        setOverwrite(false);
        return;
      }

      setCurrentValue((prev) => {
        if (overwrite) return digit;
        if (prev === "0") return digit;
        if (prev.length >= MAX_DISPLAY_LEN) return prev;
        return prev + digit;
      });
      setOverwrite(false);
    },
    [hasError, overwrite]
  );

  const inputDecimal = useCallback(() => {
    if (hasError) {
      setCurrentValue("0.");
      setPreviousValue(null);
      setOperator(null);
      setOverwrite(false);
      return;
    }

    setCurrentValue((prev) => {
      if (overwrite) return "0.";
      if (prev.includes(".")) return prev;
      if (prev.length >= MAX_DISPLAY_LEN) return prev;
      return prev + ".";
    });
    setOverwrite(false);
  }, [hasError, overwrite]);

  const toggleSign = useCallback(() => {
    if (hasError) {
      clearAll();
      return;
    }
    setCurrentValue((prev) => {
      if (prev === "0") return prev;
      if (prev.startsWith("-")) return prev.slice(1);
      return "-" + prev;
    });
    setOverwrite(false);
  }, [clearAll, hasError]);

  const safeCompute = useCallback((aStr, op, bStr) => {
    const a = Number(aStr);
    const b = Number(bStr);

    if (!Number.isFinite(a) || !Number.isFinite(b)) {
      return { ok: false, value: "Error" };
    }

    switch (op) {
      case "+":
        return { ok: true, value: String(a + b) };
      case "-":
        return { ok: true, value: String(a - b) };
      case "*":
        return { ok: true, value: String(a * b) };
      case "/":
        if (b === 0) return { ok: false, value: "Cannot divide by zero" };
        return { ok: true, value: String(a / b) };
      case "%":
        if (b === 0) return { ok: false, value: "Cannot divide by zero" };
        return { ok: true, value: String(a % b) };
      default:
        return { ok: false, value: "Error" };
    }
  }, []);

  const commitOperator = useCallback(
    (nextOpRaw) => {
      const nextOp = normalizeOperator(nextOpRaw);
      if (!nextOp) return;

      if (hasError) {
        // After error, allow operator to reset state to start new calc from 0
        setCurrentValue("0");
        setPreviousValue(null);
        setOperator(nextOp);
        setOverwrite(true);
        return;
      }

      // If there is already an operator and we have a previousValue, compute sequentially.
      // Example: 2 + 3 × 4 => (2+3)=5 then set operator to ×, waiting for next operand.
      if (previousValue != null && operator != null && !overwrite) {
        const aStr = previousValue;
        const bStr = currentValue;
        const op = operator;

        const result = safeCompute(aStr, op, bStr);

        setCurrentValue(result.value);
        setPreviousValue(result.ok ? result.value : null);
        setOperator(nextOp);
        setOverwrite(true);

        // Side-effect: log successful calculations to Supabase.
        if (result.ok) {
          const session_id = getOrCreateSessionId();
          void insertCalculation({
            a: Number(aStr),
            b: Number(bStr),
            operator: op,
            result: Number(result.value),
            session_id,
          });
        }

        return;
      }

      // If user presses operator repeatedly, just update the operator.
      if (previousValue != null && operator != null && overwrite) {
        setOperator(nextOp);
        return;
      }

      // Otherwise store current as previous and set operator.
      setPreviousValue(currentValue);
      setOperator(nextOp);
      setOverwrite(true);
    },
    [currentValue, hasError, operator, overwrite, previousValue, safeCompute]
  );

  const evaluateEquals = useCallback(() => {
    if (hasError) {
      clearAll();
      return;
    }
    if (previousValue == null || operator == null) {
      // Nothing to compute
      setOverwrite(true);
      return;
    }

    // If equals is pressed right after operator (overwrite=true), treat it as "previous op previous"
    // Example: "5 + =" -> 10. This matches common calculator behavior.
    const rhs = overwrite ? previousValue : currentValue;

    const aStr = previousValue;
    const bStr = rhs;
    const op = operator;

    const result = safeCompute(aStr, op, bStr);

    setCurrentValue(result.value);
    setPreviousValue(null);
    setOperator(null);
    setOverwrite(true);

    // Side-effect: log successful calculations to Supabase.
    if (result.ok) {
      const session_id = getOrCreateSessionId();
      void insertCalculation({
        a: Number(aStr),
        b: Number(bStr),
        operator: op,
        result: Number(result.value),
        session_id,
      });
    }
  }, [clearAll, currentValue, hasError, operator, overwrite, previousValue, safeCompute]);

  // Keyboard support: digits, operations, Enter, Backspace, Escape, decimal.
  useEffect(() => {
    const onKeyDown = (e) => {
      const key = e.key;

      if (isDigit(key)) {
        e.preventDefault();
        inputDigit(key);
        return;
      }

      if (key === ".") {
        e.preventDefault();
        inputDecimal();
        return;
      }

      if (key === "Enter" || key === "=") {
        e.preventDefault();
        evaluateEquals();
        return;
      }

      if (key === "Escape") {
        e.preventDefault();
        clearAll();
        return;
      }

      if (key === "Backspace") {
        e.preventDefault();
        backspace();
        return;
      }

      const op = normalizeOperator(key);
      if (op) {
        e.preventDefault();
        commitOperator(op);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [backspace, clearAll, commitOperator, evaluateEquals, inputDecimal, inputDigit]);

  const buttons = useMemo(
    () => [
      { label: "C", kind: "control", onClick: clearAll, aria: "Clear" },
      { label: "⌫", kind: "control", onClick: backspace, aria: "Backspace" },
      { label: "%", kind: "op", onClick: () => commitOperator("%"), aria: "Modulus" },
      { label: "÷", kind: "op", onClick: () => commitOperator("/"), aria: "Divide" },

      { label: "7", kind: "digit", onClick: () => inputDigit("7") },
      { label: "8", kind: "digit", onClick: () => inputDigit("8") },
      { label: "9", kind: "digit", onClick: () => inputDigit("9") },
      { label: "×", kind: "op", onClick: () => commitOperator("*"), aria: "Multiply" },

      { label: "4", kind: "digit", onClick: () => inputDigit("4") },
      { label: "5", kind: "digit", onClick: () => inputDigit("5") },
      { label: "6", kind: "digit", onClick: () => inputDigit("6") },
      { label: "-", kind: "op", onClick: () => commitOperator("-"), aria: "Subtract" },

      { label: "1", kind: "digit", onClick: () => inputDigit("1") },
      { label: "2", kind: "digit", onClick: () => inputDigit("2") },
      { label: "3", kind: "digit", onClick: () => inputDigit("3") },
      { label: "+", kind: "op", onClick: () => commitOperator("+"), aria: "Add" },

      // Last row uses a wider "0" and a tall "=" (handled with inline grid spans)
      { label: "±", kind: "control", onClick: toggleSign, aria: "Toggle sign" },
      { label: "0", kind: "digit", onClick: () => inputDigit("0"), wide: true },
      { label: ".", kind: "digit", onClick: inputDecimal, aria: "Decimal" },
      { label: "=", kind: "equals", onClick: evaluateEquals, aria: "Equals", tall: true },
    ],
    [backspace, clearAll, commitOperator, evaluateEquals, inputDecimal, inputDigit, toggleSign]
  );

  const containerStyle = {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    padding: "24px 16px",
    background: `linear-gradient(180deg, ${THEME.background} 0%, #ffffff 60%)`,
    color: THEME.text,
  };

  const panelStyle = {
    width: "min(420px, 92vw)",
    background: THEME.surface,
    border: `1px solid ${THEME.border}`,
    borderRadius: 18,
    boxShadow: "0 18px 40px rgba(17, 24, 39, 0.10)",
    overflow: "hidden",
  };

  const headerStyle = {
    padding: "18px 18px 10px 18px",
    borderBottom: `1px solid ${THEME.border}`,
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 12,
  };

  const titleStyle = {
    fontSize: 14,
    fontWeight: 700,
    letterSpacing: "0.02em",
    color: THEME.text,
    margin: 0,
  };

  const hintStyle = {
    fontSize: 12,
    margin: 0,
    color: THEME.mutedText,
    textAlign: "right",
  };

  const displayWrapStyle = {
    padding: "16px 18px 14px 18px",
    background: "linear-gradient(180deg, rgba(37, 99, 235, 0.08), rgba(255,255,255,0))",
  };

  const previewStyle = {
    minHeight: 18,
    fontSize: 12,
    color: THEME.mutedText,
    textAlign: "right",
    marginBottom: 8,
    userSelect: "none",
  };

  const displayStyle = {
    width: "100%",
    border: `1px solid ${THEME.border}`,
    background: THEME.surface,
    borderRadius: 14,
    padding: "14px 12px",
    fontSize: "clamp(28px, 4.4vw, 40px)",
    fontWeight: 800,
    textAlign: "right",
    lineHeight: 1.1,
    letterSpacing: "-0.02em",
    color: hasError ? THEME.error : THEME.text,
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
    boxShadow: "0 8px 18px rgba(17, 24, 39, 0.06)",
  };

  const gridStyle = {
    padding: 14,
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gridAutoRows: 56,
    gap: 10,
    background: THEME.surface,
  };

  const baseButtonStyle = {
    borderRadius: 14,
    border: `1px solid ${THEME.border}`,
    background: "#ffffff",
    color: THEME.text,
    fontSize: 18,
    fontWeight: 700,
    cursor: "pointer",
    transition: "transform 120ms ease, box-shadow 120ms ease, background 120ms ease, border-color 120ms ease",
    boxShadow: "0 10px 18px rgba(17, 24, 39, 0.06)",
    outline: "none",
  };

  const getButtonStyle = (btn) => {
    const isActiveOp =
      btn.kind === "op" &&
      operator != null &&
      normalizeOperator(btn.label) === operator &&
      previousValue != null;

    let style = { ...baseButtonStyle };

    if (btn.kind === "op") {
      style.background = isActiveOp ? "rgba(37, 99, 235, 0.14)" : "rgba(37, 99, 235, 0.08)";
      style.borderColor = isActiveOp ? "rgba(37, 99, 235, 0.35)" : "rgba(37, 99, 235, 0.20)";
      style.color = THEME.primary;
    }

    if (btn.kind === "control") {
      style.background = "rgba(245, 158, 11, 0.10)";
      style.borderColor = "rgba(245, 158, 11, 0.25)";
      style.color = "#92400e"; // amber-800-ish
    }

    if (btn.kind === "equals") {
      style.background = `linear-gradient(180deg, ${THEME.primary}, #1d4ed8)`;
      style.borderColor = "rgba(37, 99, 235, 0.65)";
      style.color = "#ffffff";
      style.boxShadow = "0 16px 26px rgba(37, 99, 235, 0.26)";
    }

    if (btn.wide) {
      style.gridColumn = "span 2";
    }

    if (btn.tall) {
      // Put "=" spanning two rows for a slightly more "pro calculator" layout
      style.gridRow = "span 2";
    }

    return style;
  };

  // Provide a consistent hover/active feel without external CSS edits
  const onPressStart = (e) => {
    e.currentTarget.style.transform = "translateY(1px)";
    e.currentTarget.style.boxShadow = "0 6px 12px rgba(17, 24, 39, 0.06)";
  };
  const onPressEnd = (e) => {
    e.currentTarget.style.transform = "translateY(0px)";
    e.currentTarget.style.boxShadow = baseButtonStyle.boxShadow;
  };

  return (
    <div style={containerStyle}>
      <main style={panelStyle} aria-label="Simple calculator">
        <div style={headerStyle}>
          <p style={titleStyle}>Calculator</p>
          <p style={hintStyle}>
            Keyboard: 0-9 · + - * / % · Enter · Backspace · Esc
          </p>
        </div>

        <section style={displayWrapStyle} aria-label="Display">
          <div style={previewStyle} aria-live="polite">
            {expressionPreview ?? "\u00A0"}
          </div>
          <div style={displayStyle} role="status" aria-live="polite" aria-atomic="true">
            {display}
          </div>
        </section>

        <section style={gridStyle} aria-label="Calculator buttons">
          {buttons.map((btn) => (
            <button
              key={btn.label}
              type="button"
              onClick={btn.onClick}
              aria-label={btn.aria ?? `Button ${btn.label}`}
              style={getButtonStyle(btn)}
              onMouseDown={onPressStart}
              onMouseUp={onPressEnd}
              onMouseLeave={onPressEnd}
            >
              {btn.label}
            </button>
          ))}
        </section>
      </main>
    </div>
  );
}

export default App;
