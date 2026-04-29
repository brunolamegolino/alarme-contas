export type Operacao = "+" | "-" | "*" | "/";

export type Conta = {
  a: number;
  b: number;
  op: Operacao;
  resposta: number;
  enunciado: string;
};

const rand = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const escolha = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

export function gerarConta(): Conta {
  const op = escolha<Operacao>(["+", "-", "*", "/"]);

  let a: number;
  let b: number;
  let resposta: number;

  switch (op) {
    case "+":
      a = rand(10, 100);
      b = rand(10, 100);
      resposta = a + b;
      break;
    case "-":
      a = rand(20, 100);
      b = rand(1, a);
      resposta = a - b;
      break;
    case "*":
      a = rand(2, 12);
      b = rand(2, 12);
      resposta = a * b;
      break;
    case "/":
      b = rand(2, 12);
      resposta = rand(2, 12);
      a = b * resposta;
      break;
  }

  return {
    a,
    b,
    op,
    resposta,
    enunciado: `${a} ${op === "*" ? "×" : op === "/" ? "÷" : op} ${b}`,
  };
}

export function gerarContas(quantidade: number): Conta[] {
  return Array.from({ length: quantidade }, () => gerarConta());
}
