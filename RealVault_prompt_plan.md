# RealVault — Confidential RWA Fund Router
## Prompt maestro para Claude Code + Plan de ejecución técnica

---

## 1. PROMPT PARA CLAUDE CODE (copiar/pegar tal cual)

```
Eres mi copiloto técnico senior para construir "RealVault", un proyecto de hackathon
(iExec WTF Hackathon Summer Edition, deadline 1 agosto 2026, deploy obligatorio en
ETH Sepolia). Actúa con rigor de ingeniería de producción, no de prototipo cosmético.

CONTEXTO DEL RETO
- Hackathon: iExec WTF Hackathon (Nox Protocol, confidential smart contracts).
- Objetivo del jurado: integrar Nox en un protocolo open-source real para añadir
  privacidad SIN romper composabilidad, usando batching/layering/otros mecanismos.
- Criterios de evaluación (orden de peso): creatividad (3), funciona end-to-end sin
  mock data (3), deploy en ETH Sepolia (2), feedback.md sobre las tools de iExec (2),
  video <=4 min (2), calidad de integración técnica con Nox (1), UX (1).
- Lección aprendida de un hackathon anterior (Stellar): un proyecto con 3 claims
  ambiciosos pero con "proof of failure" en el código sacó 3/5. Los ganadores reales
  tenían 1-2 claims MENOS ambiciosos pero demostrados al 100% sin fallos. Aplica esta
  lección: prioriza que TODO lo que se muestre funcione real, sobre añadir más features.

MI PROYECTO: "RealVault" — Confidential RWA Fund Router
Tesis: un fondo tokenizado (RWA) donde:
1. Cada inversor tiene una posición cifrada (balance confidencial, ERC-7984) proporcional
   a su depósito en un pool.
2. El fondo publica métricas agregadas PÚBLICAS (NAV total, distribución por activo)
   sin revelar nunca la posición individual de ningún inversor.
3. Tres niveles de Access Control List (ACL) simultáneos sobre los handles cifrados:
   - Inversor: ve su propio balance completo (descifrado local).
   - Auditor/regulador: acceso temporal revocable a todo el libro de posiciones
     (selective disclosure programable, se otorga y revoca en una sola tx).
   - Mercado/público: solo ve el NAV agregado, nunca posiciones individuales.
4. Un agente de rebalanceo automatizado que ejecuta swaps entre 2 activos del fondo
   (simulados como dos ERC-7984 tokens) sin exponer las cantidades exactas en cada
   operación al mercado — solo el resultado agregado (NAV) cambia visiblemente.
5. Un script de verificación (inspirado en pruebas tipo "zero egress" de auditoría)
   que demuestre matemáticamente que: suma(balances cifrados individuales) == NAV
   público declarado, SIN desencriptar ningún balance individual en el proceso.
   Esto es el "proof of trustlessness" central del proyecto — debe ser irrefutable.

STACK TÉCNICO REQUERIDO
- Solidity ^0.8.28, Hardhat con @iexec-nox/nox-hardhat-plugin.
- @iexec-nox/nox-confidential-contracts (ERC7984, ERC7984Advanced, ERC20ToERC7984Wrapper).
- FHE library de Nox para operaciones cifradas on-chain (sumas, comparaciones sobre
  ciphertext handles) — usar para el cálculo de NAV agregado sin descifrar posiciones.
- Nox ACL nativo (grant/revoke por handle) para los 3 niveles de disclosure.
- Frontend: Next.js 14 + wagmi v2 + viem, conectando a Sepolia.
- Deploy: ETH Sepolia (obligatorio para el hackathon).
- Testing: Hardhat + Foundry si aplica, con tests que verifiquen ACL grants/revokes
  y que el NAV agregado sea matemáticamente correcto sin fugas de datos.

FASE 0 — SETUP (haz esto primero, en orden, sin saltarte pasos)
1. Clona y adapta nox-hardhat-starter (github.com/iExec-Nox/nox-hardhat-starter) como
   base del repo. Verifica que compila y despliega un ERC7984 "Hello World" en Sepolia
   ANTES de escribir lógica de negocio.
2. Genera el contrato base con el Nox Contracts Wizard (cdefi-wizard.iex.ec) para
   confirmar la sintaxis exacta del import de ERC7984 en la versión actual del SDK.
3. Lee entera la documentación de ACL de Nox (docs.iex.ec/nox-protocol) antes de
   diseñar el esquema de permisos — no asumas la API, verifícala en código real.
4. Confirma cómo funciona el FHE library de Nox para sumas sobre ciphertexts —
   este es el componente de más riesgo técnico del proyecto (NAV agregado sin
   descifrar), así que dedica tiempo extra a validarlo con un ejemplo mínimo
   ANTES de integrarlo al contrato principal.

FASE 1 — CONTRATOS CORE
1. FundVault.sol: recibe depósitos en un ERC-20 mock (simulando USDC), emite
   posiciones confidenciales ERC-7984 proporcionales al depósito.
2. NAVAggregator.sol: usa FHE.add (o equivalente en el SDK actual) para sumar
   posiciones cifradas y publicar un NAV total DESCIFRADO públicamente, sin exponer
   ningún sumando individual. Verifica en tests que esto es matemáticamente correcto.
3. DisclosureManager.sol: implementa los 3 niveles de ACL:
   - grantAuditorAccess(address auditor, uint256 expiryTimestamp)
   - revokeAuditorAccess(address auditor)
   - view functions que respeten el nivel de acceso del caller.
4. RebalancerAgent.sol (+ script off-chain): ejecuta un swap simulado entre dos
   activos del fondo (dos tokens ERC-7984) ajustando posiciones cifradas, sin
   revelar el monto exacto de cada operación — solo el NAV público se actualiza.

FASE 2 — SCRIPT DE VERIFICACIÓN (crítico para el pitch)
Crea scripts/nav-integrity-check.ts que:
1. Lea todos los handles de posiciones individuales cifradas on-chain.
2. Calcule la suma vía FHE (sin descifrar ningún valor individual).
3. Compare el resultado contra el NAV público declarado por el contrato.
4. Imprima un reporte tipo "ZERO individual balance exposure. NAV integrity verified:
   [suma cifrada] == [NAV público]. N inversores, 0 balances revelados."
Este script debe poder ejecutarse en CI y ser el centerpiece de la demo/video.

FASE 3 — FRONTEND MÍNIMO FUNCIONAL
1. Vista inversor: conectar wallet, depositar, ver balance propio descifrado localmente.
2. Vista pública: dashboard con NAV agregado y distribución por activo (sin logins).
3. Vista auditor: simulación de acceso temporal (otorgar/revocar en 1 tx, ver libro
   completo mientras el acceso esté activo).
4. Vista agente: trigger manual del rebalanceo (para demo), mostrando que el NAV
   se actualiza pero ninguna cantidad individual de swap se expone en el explorer.

FASE 4 — ENTREGABLES DEL HACKATHON
1. README.md completo con instrucciones de instalación/uso, arquitectura, diagramas.
2. feedback.md con feedback real y específico sobre las Nox tools usadas (SDK,
   wizard, hardhat plugin) — esto vale 2 estrellas, no lo trates como relleno.
3. Video demo <=4 min: prioriza mostrar el script de verificación de NAV corriendo
   en vivo contra Sepolia como el momento "wow" del video, no solo la UI.
4. Deploy verificado en ETH Sepolia con direcciones de contrato documentadas.
5. Post en X (Twitter) tageando @iEx_ec con descripción, video y link al repo público.

REGLAS DURAS (no negociables)
- NO comitear ningún feature que no funcione end-to-end. Si algo no está terminado
  al 100%, sácalo del scope antes que dejarlo roto en el repo.
- CERO mock data en el flujo principal — todo debe correr contra contratos reales
  desplegados en Sepolia, transacciones reales verificables en el explorer.
- Cada claim de privacidad debe tener una prueba programática (test o script), no
  solo una afirmación en el README.
- Prioriza 2-3 features perfectas sobre 5 features a medias.

Empecemos por la Fase 0. Ejecuta el setup del starter kit y confirma que compila y
despliega en Sepolia antes de tocar cualquier lógica de negocio. Reporta cualquier
discrepancia entre la documentación y el comportamiento real del SDK.
```

---

## 2. PLAN DE EJECUCIÓN DÍA A DÍA (11 días, hasta 1 agosto)

| Día | Bloque | Entregable del día |
|---|---|---|
| 1 | Setup nox-hardhat-starter + wizard + deploy Hello World en Sepolia | Repo base funcionando, 1 tx real en Sepolia |
| 2 | Validar FHE library con ejemplo mínimo de suma sobre ciphertexts | Prueba de concepto aislada de "NAV sin descifrar" |
| 3-4 | FundVault.sol + emisión de posiciones ERC-7984 proporcionales a depósito | Contrato de depósito funcional + tests |
| 5 | NAVAggregator.sol (la pieza de mayor riesgo técnico) | NAV público correcto, verificado con tests |
| 6 | DisclosureManager.sol (3 niveles de ACL) | grant/revoke funcionando, tests de acceso |
| 7 | RebalancerAgent.sol + script off-chain de rebalanceo | Swap simulado sin exposición de montos |
| 8 | scripts/nav-integrity-check.ts (el "wow" del proyecto) | Script ejecutándose contra Sepolia real |
| 9 | Frontend (4 vistas: inversor, público, auditor, agente) | dApp funcional conectada a Sepolia |
| 10 | README + feedback.md + buffer de bugs | Documentación completa, repo limpio |
| 11 | Grabación video (4 min), post en X, submission final | Entrega completa antes del deadline |

---

## 3. SKILLS, SDKs Y APIs A USAR

| Categoría | Herramienta | Uso específico |
|---|---|---|
| Smart contracts | Solidity ^0.8.28 | Lenguaje base de todos los contratos |
| Framework dev | Hardhat + @iexec-nox/nox-hardhat-plugin | Setup, compile, deploy, testing |
| Token confidencial | @iexec-nox/nox-confidential-contracts (ERC7984, ERC7984Advanced) | Posiciones cifradas de inversores |
| Wrapper | ERC20ToERC7984Wrapper | Convertir depósito USDC-mock a posición confidencial |
| Cripto homomórfica | FHE library de Nox | Suma de balances cifrados para el NAV agregado |
| Control de acceso | Nox ACL nativo (grant/revoke por handle) | Los 3 niveles de disclosure (inversor/auditor/mercado) |
| Generador de contratos | Nox Contracts Wizard (cdefi-wizard.iex.ec) | Validar sintaxis exacta antes de codear a mano |
| Red de despliegue | ETH Sepolia testnet | Requisito obligatorio del hackathon |
| Frontend | Next.js 14 + wagmi v2 + viem | dApp con 4 vistas (inversor/público/auditor/agente) |
| Testing | Hardhat test + Foundry (si aplica) | Verificación de ACL y de integridad matemática del NAV |
| Documentación | Markdown (README.md, feedback.md) | Entregables obligatorios del hackathon |
| Video | Cualquier grabador de pantalla + editor simple | Demo <=4 min mostrando el script de verificación en vivo |
| Difusión | X (Twitter) | Submission oficial, tag @iEx_ec |
