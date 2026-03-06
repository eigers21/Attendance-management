import { GAS_API_URL } from "../config.js";

export async function sendToGas(data) {
    try {
        await fetch(GAS_API_URL, {
            method: 'POST',
            mode: 'no-cors',
            body: JSON.stringify(data)
        });
    } catch (e) {
        console.error("GAS Communication Error:", e);
    }
}
