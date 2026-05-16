'use strict';

/**
 * Testes do fluxo de transferência de licença (biblioteca.html).
 * Cobre: validação de endereço, auto-transferência, verificação do destinatário.
 */

// ── Lógica extraída de biblioteca.html ───────────────────────────────────────

const ADDR_REGEX = /^0x[0-9a-fA-F]{40}$/i;

function validateTransferAddress(toAddr, fromAddr) {
  if (!ADDR_REGEX.test(toAddr)) {
    return { ok: false, error: 'Endereço Ethereum inválido.' };
  }
  if (fromAddr && toAddr.toLowerCase() === fromAddr.toLowerCase()) {
    return { ok: false, error: 'Não é possível transferir um livro para você mesmo.' };
  }
  return { ok: true };
}

/**
 * Lógica de pré-visualização da transferência:
 * tenta previewTransfer → fallback lookupUser → bloqueia se não encontrar nome.
 */
async function runPreviewTransfer({ toAddr, fromAddr, previewFn, lookupFn }) {
  const validation = validateTransferAddress(toAddr, fromAddr);
  if (!validation.ok) throw new Error(validation.error);

  let recipientName = null;
  let recipientCpf  = null;

  try {
    const preview = await previewFn(toAddr);
    const r = preview.newOwner || {};
    recipientName = r.name || null;
    recipientCpf  = r.cpf  || null;
  } catch {
    try {
      const user = await lookupFn(toAddr);
      recipientName = user.name || null;
      recipientCpf  = user.cpf  || null;
    } catch {
      // ambos falharam — recipientName fica null
    }
  }

  if (!recipientName) {
    throw new Error('Carteira não cadastrada na plataforma.');
  }

  return { recipientName, recipientCpf, toAddr };
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const VALID_ADDR_A = '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12';
const VALID_ADDR_B = '0x1111111111111111111111111111111111111111';

// ── Testes de validação de endereço ──────────────────────────────────────────

describe('validateTransferAddress', () => {
  test('rejeita string vazia', () => {
    expect(validateTransferAddress('', VALID_ADDR_A).ok).toBe(false);
  });

  test('rejeita username sem 0x', () => {
    expect(validateTransferAddress('matheusmerlim', VALID_ADDR_A).ok).toBe(false);
    expect(validateTransferAddress('matheusmerlim', VALID_ADDR_A).error).toMatch(/inválido/i);
  });

  test('rejeita endereço com menos de 42 chars', () => {
    expect(validateTransferAddress('0xabc', VALID_ADDR_A).ok).toBe(false);
  });

  test('rejeita endereço com mais de 42 chars', () => {
    const long = VALID_ADDR_A + '00';
    expect(validateTransferAddress(long, VALID_ADDR_A).ok).toBe(false);
  });

  test('rejeita endereço com caracteres não-hex', () => {
    expect(validateTransferAddress('0xGGGG111111111111111111111111111111111111', VALID_ADDR_A).ok).toBe(false);
  });

  test('aceita endereço válido 0x + 40 hex', () => {
    expect(validateTransferAddress(VALID_ADDR_B, VALID_ADDR_A).ok).toBe(true);
  });

  test('rejeita auto-transferência (endereço igual ao remetente)', () => {
    const result = validateTransferAddress(VALID_ADDR_A, VALID_ADDR_A);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/você mesmo/i);
  });

  test('rejeita auto-transferência independente de maiúsculas/minúsculas', () => {
    const lower = VALID_ADDR_A.toLowerCase();
    const upper = VALID_ADDR_A.toUpperCase();
    expect(validateTransferAddress(lower, upper).ok).toBe(false);
    expect(validateTransferAddress(upper, lower).ok).toBe(false);
  });

  test('permite transferência quando fromAddr é null (não logado)', () => {
    expect(validateTransferAddress(VALID_ADDR_B, null).ok).toBe(true);
  });
});

// ── Testes de runPreviewTransfer ──────────────────────────────────────────────

describe('runPreviewTransfer — sucesso via previewFn', () => {
  test('retorna nome e CPF do destinatário quando previewFn resolve', async () => {
    const previewFn = jest.fn().mockResolvedValue({
      newOwner: { name: 'João Silva', cpf: '12345678901' },
    });
    const lookupFn = jest.fn();

    const result = await runPreviewTransfer({
      toAddr: VALID_ADDR_B, fromAddr: VALID_ADDR_A, previewFn, lookupFn,
    });

    expect(result.recipientName).toBe('João Silva');
    expect(result.recipientCpf).toBe('12345678901');
    expect(result.toAddr).toBe(VALID_ADDR_B);
    expect(lookupFn).not.toHaveBeenCalled();
  });

  test('usa lookupFn quando previewFn lança', async () => {
    const previewFn = jest.fn().mockRejectedValue(new Error('não disponível'));
    const lookupFn  = jest.fn().mockResolvedValue({ name: 'Maria Costa', cpf: '98765432100' });

    const result = await runPreviewTransfer({
      toAddr: VALID_ADDR_B, fromAddr: VALID_ADDR_A, previewFn, lookupFn,
    });

    expect(result.recipientName).toBe('Maria Costa');
    expect(lookupFn).toHaveBeenCalledWith(VALID_ADDR_B);
  });
});

describe('runPreviewTransfer — bloqueios', () => {
  test('lança erro para username sem 0x', async () => {
    await expect(
      runPreviewTransfer({ toAddr: 'joaosilva', fromAddr: VALID_ADDR_A, previewFn: jest.fn(), lookupFn: jest.fn() })
    ).rejects.toThrow(/inválido/i);
  });

  test('lança erro de auto-transferência antes de chamar a API', async () => {
    const previewFn = jest.fn();
    await expect(
      runPreviewTransfer({ toAddr: VALID_ADDR_A, fromAddr: VALID_ADDR_A, previewFn, lookupFn: jest.fn() })
    ).rejects.toThrow(/você mesmo/i);
    expect(previewFn).not.toHaveBeenCalled();
  });

  test('lança erro quando previewFn e lookupFn falham (endereço não cadastrado)', async () => {
    const previewFn = jest.fn().mockRejectedValue(new Error('404'));
    const lookupFn  = jest.fn().mockRejectedValue(new Error('404'));

    await expect(
      runPreviewTransfer({ toAddr: VALID_ADDR_B, fromAddr: VALID_ADDR_A, previewFn, lookupFn })
    ).rejects.toThrow(/Carteira não cadastrada/i);
  });

  test('lança erro quando destinatário não tem nome cadastrado', async () => {
    const previewFn = jest.fn().mockResolvedValue({ newOwner: { name: null, cpf: null } });
    const lookupFn  = jest.fn();

    await expect(
      runPreviewTransfer({ toAddr: VALID_ADDR_B, fromAddr: VALID_ADDR_A, previewFn, lookupFn })
    ).rejects.toThrow(/Carteira não cadastrada/i);
  });
});
