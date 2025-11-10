require("dotenv").config();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { poolPromise, sql } = require("../config/db.js");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
  model: process.env.GEMINI_MODEL || "gemini-1.5-flash-latest"
});

const respostasComuns = [
  { pergunta: /ovo engorda\??/i, resposta: "Não, ovo é uma ótima fonte de proteína e não engorda sozinho. O importante é a quantidade e equilíbrio na dieta." },
  { pergunta: /pão à noite\??/i, resposta: "Pão à noite não é proibido, mas prefira integral e combine com proteínas para saciedade." },
  { pergunta: /posso comer doces\??/i, resposta: "Pode sim, mas moderação é a chave. Prefira doces naturais, como frutas." },
  { pergunta: /quero perder peso/i, resposta: "Para perder peso, foque em déficit calórico, proteínas adequadas e escolha de alimentos nutritivos." },
  { pergunta: /quero ganhar massa/i, resposta: "Para ganhar massa, aumente proteínas, carboidratos saudáveis e mantenha treino regular." },
  { pergunta: /como aumentar proteína/i, resposta: "Inclua ovos, carnes magras, peixes, leite, iogurte e leguminosas na sua dieta diária." },
  { pergunta: /quanto devo beber de água/i, resposta: "O ideal é cerca de 2 litros por dia, ajustando conforme atividade física e clima." },
  { pergunta: /melhor horário para treinar/i, resposta: "O melhor horário é aquele que você consegue manter de forma consistente, seja manhã, tarde ou noite." },
  { pergunta: /café da manhã é importante/i, resposta: "Sim, ele dá energia para o dia, ajuda a controlar fome e melhora concentração." },
  { pergunta: /quanto comer de carboidrato/i, resposta: "Depende do seu objetivo, mas escolha carboidratos complexos como arroz integral, batata, quinoa e aveia." },
  { pergunta: /qual melhor lanche/i, resposta: "Frutas, iogurte natural, castanhas e sanduíches integrais são boas opções de lanche saudável." },
  { pergunta: /ovo ou frango/i, resposta: "Ambos são ótimas fontes de proteína; escolha o que preferir e varie durante a semana." },
  { pergunta: /evitar gordura/i, resposta: "Evite gorduras trans e ultraprocessadas. Prefira azeite, abacate, oleaginosas e peixes." },
  { pergunta: /como ganhar energia/i, resposta: "Coma carboidratos complexos, proteínas e mantenha hidratação adequada." },
  { pergunta: /chá ajuda a emagrecer/i, resposta: "Alguns chás podem auxiliar na hidratação e metabolismo, mas não substituem alimentação equilibrada." },
  { pergunta: /quantas refeições por dia/i, resposta: "Geralmente 3 refeições principais + 1-2 lanches saudáveis, adaptando à sua rotina." },
  { pergunta: /posso comer à noite/i, resposta: "Pode, mas prefira refeições leves, evitando grandes quantidades de carboidratos simples." },
  { pergunta: /iogurte faz bem/i, resposta: "Sim, principalmente natural, é fonte de proteínas e probióticos que auxiliam na digestão." },
  { pergunta: /frutas engordam/i, resposta: "Não, frutas são saudáveis e fornecem vitaminas, fibras e energia, desde que consumidas com moderação." },
  { pergunta: /como evitar fome à noite/i, resposta: "Inclua proteínas e fibras no jantar; evite açúcar e alimentos ultraprocessados perto da hora de dormir." },
  { pergunta: /suco natural ou refrigerante/i, resposta: "Prefira sucos naturais sem açúcar. Evite refrigerantes, mesmo zero, que podem atrapalhar metabolismo e saciedade." },
  { pergunta: /o que é dieta balanceada/i, resposta: "Uma dieta balanceada inclui proteínas, carboidratos complexos, gorduras boas, fibras, vitaminas e minerais." },
  { pergunta: /alimentos processados/i, resposta: "Evite ultraprocessados ricos em açúcar, sódio e gorduras ruins; prefira alimentos naturais e frescos." },
  { pergunta: /como aumentar massa muscular/i, resposta: "Treino de resistência + proteínas suficientes + calorias adequadas são a chave." },
  { pergunta: /como reduzir gordura/i, resposta: "Déficit calórico controlado + exercícios regulares + foco em alimentos nutritivos ajudam na redução de gordura." },
  { pergunta: /qual melhor proteína/i, resposta: "Proteínas magras como frango, peixe, ovos, leguminosas e laticínios são excelentes escolhas." },
  { pergunta: /melhor café/i, resposta: "Prefira café puro ou com pouco açúcar. Pode ajudar na energia e concentração, moderadamente." },
  { pergunta: /fast food faz mal/i, resposta: "Sim, em excesso contribui para obesidade, doenças cardíacas e alterações metabólicas." },
  { pergunta: /como melhorar digestão/i, resposta: "Fibras, água suficiente, probióticos e alimentação regular ajudam na digestão." },
  { pergunta: /suplemento necessário/i, resposta: "Suplementos só se houver necessidade identificada por nutricionista ou médico; alimentação completa é prioridade." },
  { pergunta: /como controlar ansiedade por comida/i, resposta: "Planejamento de refeições, lanches saudáveis e técnicas de respiração podem ajudar a controlar a fome emocional." }
];

const salvarHistorico = async (usuarioId, mensagem, resposta, modo) => {
  const pool = await poolPromise;
  const request = pool.request();
  await request
    .input("usuario_id", sql.Int, usuarioId)
    .input("mensagem", sql.NVarChar, mensagem)
    .input("resposta", sql.NVarChar, resposta)
    .input("modo_chat", sql.VarChar, modo)
    .query(`
      INSERT INTO chatHistorico (usuario_id, mensagem, resposta, modo_chat) 
      VALUES (@usuario_id, @mensagem, @resposta, @modo_chat)
    `);
};

const buscarAlimentos = async (mensagem) => {
  const pool = await poolPromise;
  const request = pool.request();
  const resultado = await request
    .input("nome", sql.VarChar, `%${mensagem}%`)
    .query("SELECT TOP 5 * FROM tbltacoNL WHERE nome_alimento LIKE @nome");

  if (resultado.recordset.length === 0) return [];
  return resultado.recordset.map(a => ({
    nome: a.nome_alimento,
    descricao: a.descricao,
    kcal: a.energia_kcal,
    proteina: a.proteina,
    carboidrato: a.carboidratos,
    gordura: a.lipideos,
    preco: a.preco_medio
  }));
};

const formatarFicha = (ficha) => {
  if (!ficha) return "O usuário não possui ficha alimentar registrada.";
  return `Objetivo: ${ficha.objetivo}
Kcal consumidas: ${ficha.total_kcal}
Proteínas: ${ficha.total_proteina}g
Carboidratos: ${ficha.total_carboidratos}g
Gorduras: ${ficha.total_gordura}g`;
};

const conversarComIA = async (req, res) => {
  const { mensagem } = req.body;
  const modo = req.body.modo || "normal";
  const userId = req.user?.id || 1;

  if (!mensagem) {
    return res.status(400).json({ mensagem: "Envie uma mensagem para a IA!" });
  }

  try {
    const respostaPronta = respostasComuns.find(item => item.pergunta.test(mensagem));
    if (respostaPronta) {
      await salvarHistorico(userId, mensagem, respostaPronta.resposta, modo);
      return res.status(200).json({ resposta: respostaPronta.resposta });
    }

    const pool = await poolPromise;
    const request = pool.request();
    const fichaResult = await request
      .input("usuario_id", sql.Int, userId)
      .query("SELECT TOP 1 * FROM fichaAlimentar WHERE usuario_id = @usuario_id");

    const fichaInfo = fichaResult.recordset.length > 0
      ? formatarFicha(fichaResult.recordset[0])
      : formatarFicha(null);

    const alimentos = await buscarAlimentos(mensagem);
    let alimentosInfo = alimentos.length > 0
      ? "Alimentos encontrados no banco:\n" + alimentos.map(a =>
          `- ${a.descricao}: ${a.kcal} kcal, ${a.proteina}g proteínas, ${a.carboidrato}g carboidratos, ${a.gordura}g gorduras, R$${a.preco ? a.preco.toFixed(2) : "N/D"}`
        ).join("\n")
      : "";

    let prompt;
    if (modo === "economico") {
      prompt = `
Você é a Salus, uma IA nutricional do sistema NutritionLite, operando no **Modo Econômico**.  
Seu papel é ajudar o usuário a **se alimentar bem gastando pouco**, com base nos dados reais do banco de dados TACO e na ficha alimentar do usuário.

---

### Funções principais:
- Buscar alimentos no banco de dados (tbltacoNL) e comparar seus valores nutricionais e custo-benefício.  
- Consultar a ficha alimentar do usuário (fichaAlimentar) para adaptar as respostas conforme o objetivo (ex: perder peso, ganhar massa, manter saúde).  
- Recomendar alternativas **mais baratas e acessíveis**, mantendo o equilíbrio nutricional.

---

Regras de busca e substituição:
1. Busque o alimento pelo nome exato no banco.  
2. Se não encontrar, procure por nomes parecidos (ex: “iogurte light” ≈ “iogurte natural”).  
3. Se ainda assim não encontrar, associe a outro alimento com nome semelhante ou função equivalente (ex: “tilápia” ≈ “sardinha”, “castanha-do-pará” ≈ “amendoim”).  
4. Sempre priorize alimentos **nacionais, simples e acessíveis**.  
5. Se for necessário substituir, explique o motivo e diga algo como:  
   > “Não encontrei este alimento, mas aqui vai uma opção mais barata com valor nutricional parecido...”  
6. Nunca invente valores nutricionais. Sempre use os dados do banco.  
7. Se o alimento não for encontrado de forma alguma, diga:  
   > “Não achei este alimento no banco de dados, mas posso sugerir opções econômicas semelhantes.”

---

Estilo e comportamento:
- Fale de forma leve, direta e empática, como um nutricionista que entende a realidade do dia a dia.  
- Traga comparações práticas:  
  > “A sardinha é tão rica em proteína quanto o salmão, mas custa muito menos.”  
- Use expressões naturais e acessíveis:  
  > “Se quiser economizar sem perder qualidade, vai de ovo cozido em vez de peito de peru.”  
- Evite termos técnicos e mantenha o foco em **acessibilidade e praticidade**.  
- Mostre sempre que comer bem não precisa ser caro.


Regras gerais:
- Baseie TODAS as respostas nos dados do banco tbltacoNL ou fichaAlimentar.  
- Priorize alternativas mais baratas e práticas.  
- Seja honesta sobre substituições.  
- Nunca recomende alimentos industrializados caros sem sugerir uma opção econômica equivalente.  
- O foco é **comer bem, gastando pouco**.

Exemplos:
Usuário: “Quero algo barato pra substituir o salmão.”  
IA: “Você pode usar sardinha ou atum enlatado. Ambos são ricos em proteína e ômega-3, e custam bem menos que o salmão.”

Usuário: “Tem opção de lanche saudável e barato?”  
IA: “Sim! Pão integral com ovo mexido e uma fruta é uma ótima opção, nutritiva e econômica.”

Usuário: “Posso comer frango frito?”  
IA: “Pode, mas prefira o frango grelhado. Além de mais saudável, gasta menos óleo e dá pra reaproveitar o tempero em outras refeições.”



📌 Ficha do usuário:
${fichaInfo}

📌 Alimentos encontrados:
${alimentosInfo}

❓ Pergunta do usuário:
${mensagem}
      `;
    } else {
      prompt = `
Você é a Salus, uma IA nutricional do sistema NutritionLite. 
Seu papel é conversar de forma natural, direta e educativa com o usuário, ajudando-o a entender melhor sua alimentação e fazer escolhas saudáveis, 
baseando-se nas informações do banco de dados TACO e na ficha alimentar do usuário. Especialista em criar combinações de alimentos saudáveis.
Com base na tabela TACO e nas preferências do usuário, você deve sugerir combinações de alimentos que formem refeições completas e equilibradas, mesmo que o usuário apenas cite um alimento.

Suas funções principais:
- Buscar alimentos no banco de dados (tabela "tbltacoNL") e usar as informações nutricionais reais.
- Consultar a ficha alimentar do usuário (tabela "fichaAlimentar") para personalizar respostas.
- Levar em conta o objetivo do usuário (ex: perder peso, ganhar massa, manter saúde).
- Gerar sugestões completas de **café da manhã, almoço e jantar**, considerando os dados da ficha alimentar e tabela TACO.
- Assegurar que o total de calorias fique dentro da meta e que haja equilíbrio entre carboidratos, proteínas e gorduras.
- Se o usuário disser “monte minha refeição” ou citar um alimento, combine-o com outros alimentos adequados.

Caso o usuário pergunte sobre um alimento:
1. Busque o alimento pelo nome exato no banco.
2. Se não encontrar, procure por nomes parecidos (ex: "frango temperado" ≈ "frango", "frago" ≈ "frango").
3. Se ainda assim não encontrar, associe com um alimento semelhante na categoria (ex: "pão de milho" ≈ "pão francês"). 
(mas tipo assim se baseie no que o usario quer por exemplo quer emagrecer recomende um o alimento que ele pediu , se ele não achar fale "Não achei este alimento, mas existem outras opções, por exemplo...")
4. Sempre avise o usuário se a resposta for baseada em uma aproximação.
5. Nunca invente valores — só use dados do banco.

Exemplos de comportamento:
Usuário: "ovo engorda?"
IA: "O ovo não engorda por si só. Ele é rico em proteínas e gorduras boas, e o efeito depende da quantidade e preparo."
Usuário: "posso comer pão à noite?"
IA: "Pode, mas prefira versões integrais e em pequenas quantidades. Isso ajuda a evitar picos de glicose à noite."

Exemplo 2:
Usuário: "Quero um lanche leve"
IA: "Uma boa combinação seria iogurte natural com aveia e morango — leve, nutritivo e cheio de fibras."
Usuário: "E se eu quiser algo pra ganhar massa?"
IA: "Tente banana com aveia e pasta de amendoim — ótimo combo energético e rico em proteínas."

Estilo:
- Fale de forma natural e objetiva.
- Evite respostas técnicas demais.
- Se não tiver informação no banco, explique o motivo e oriente o usuário de forma prática.
- Seja empática, educativa e sempre transparente.

Regras:
- Combine alimentos que façam sentido juntos (ex: banana + aveia + leite = café da manhã saudável)
- Explique brevemente por que a combinação é boa (ex: “rico em energia e fibras”)
- Se o usuário tiver um objetivo (ex: perder peso, ganhar massa), leve isso em conta.
- Se o usuário citar apenas um alimento, sugira complementos automáticos.
- Baseie TODAS as respostas nos dados do banco TACO ou ficha do usuário.
- Se usar aproximações, explique de forma honesta.
- Nunca invente alimentos inexistentes.
- Sempre priorize o alimento mais parecido no nome ou categoria.
- Sempre priorize alimento do banco de dados na tabela tbltacoNL.

📌 Ficha do usuário:
${fichaInfo}

📌 Alimentos encontrados:
${alimentosInfo}

❓ Pergunta do usuário:
${mensagem}

🔸 Regras:
- Crie refeições equilibradas (proteína + carboidrato + fibra + gordura boa)
- Baseie-se no objetivo: perda de peso, ganho de massa, manutenção
- Ajuste calorias conforme a meta do usuário
- Evite repetir alimentos semelhantes
- Sempre explique brevemente o motivo da combinação
      `;
    }

    const result = await model.generateContent(prompt);
    const respostaIA = result.response.text();

    await salvarHistorico(userId, mensagem, respostaIA, modo);

    return res.status(200).json({ resposta: respostaIA });
  } catch (erro) {
    console.error("Erro ao conversar com a IA:", erro);
    res.status(500).json({ erro: "Erro interno ao processar a conversa com a IA." });
  }
};

module.exports = { conversarComIA };