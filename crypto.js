// Chave mestra simples para o projeto (em um sistema real, isso seria único por usuário)
const SECRET_KEY_PASSWORD = "chave-secreta-dlm-2026";

async function getCryptoKey() {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        "raw", 
        enc.encode(SECRET_KEY_PASSWORD), 
        { name: "PBKDF2" }, 
        false, 
        ["deriveKey"]
    );
    return crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: enc.encode("unique-salt"),
            iterations: 100000,
            hash: "SHA-256"
        },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
    );
}

export async function encriptarArquivo(file) {
    const key = await getCryptoKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const content = await file.arrayBuffer();
    
    const encryptedContent = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        key,
        content
    );

    // Retorna o IV + Conteúdo encriptado em Base64 para salvar no localStorage
    const combined = new Uint8Array(iv.length + encryptedContent.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encryptedContent), iv.length);
    
    return btoa(String.fromCharCode.apply(null, combined));
}

export async function decriptarParaUrl(base64Data) {
    const key = await getCryptoKey();
    const combined = new Uint8Array(atob(base64Data).split("").map(c => c.charCodeAt(0)));
    
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);
    
    const decryptedContent = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv },
        key,
        data
    );

    const blob = new Blob([decryptedContent], { type: "application/pdf" });
    return URL.createObjectURL(blob);
}