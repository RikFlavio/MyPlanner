# My Planner 📅

**Smart Weekly Planner** - Un'applicazione web per pianificare la tua settimana con un algoritmo che impara dalle tue abitudini.

![My Planner](MyPlanner.png)

## ✨ Caratteristiche

### Pianificazione

- 📅 Vista settimanale (desktop) e giornaliera (mobile)
- 🕐 Griglia oraria dalle 5:00 alle 5:00 (24 ore)
- 🎯 Drag & drop per pianificare i task
- 📱 Tap per aggiungere task su mobile
- 👆 Swipe per navigare tra i giorni

### Task

- 🏷️ 6 categorie: Lavoro, Salute, Casa, Personale, Sociale, Altro
- ⏱️ Durata personalizzabile
- ✅ Completa / ⏭️ Salta / 🗑️ Rimuovi
- 📊 Tracciamento orario effettivo vs pianificato

### Algoritmo Intelligente 🧠

L'app **impara dalle tue abitudini** analizzando:

- ⏰ **Pattern temporali** - A che ora fai solitamente ogni task
- ⏱️ **Durate reali** - Quanto tempo impieghi davvero
- 📆 **Frequenze** - Quali giorni preferisci per ogni attività
- 🔗 **Sequenze** - Quali task fai di seguito
- ✅ **Completamenti** - Quando sei più produttivo

### Suggerimenti

- 💡 **Insights** basati sui tuoi pattern
- 🪄 **Routine suggerita** - Pre-compila il giorno basandosi sulle tue abitudini
- 📈 Statistiche di completamento

### Altre funzionalità

- 🌙 Tema scuro / ☀️ Tema chiaro
- 💾 Dati salvati localmente (IndexedDB)
- 📤 Esporta / 📥 Importa backup JSON
- 📱 PWA installabile
- 🔒 Privacy: nessun dato inviato a server

### Opzione: PWA

1. Visita l'app nel browser
2. Clicca "Installa" o "Aggiungi a Home"
3. Usa l'app come un'applicazione nativa

## 📁 Struttura file

```
my-planner/
├── index.html      # Struttura HTML
├── styles.css      # Stili e responsive design
├── app.js          # Logica applicazione
├── db.js           # Gestione IndexedDB
├── algorithm.js    # Algoritmo di apprendimento
├── manifest.json   # PWA manifest
├── MyPlanner.png   # Icona app
└── README.md       # Documentazione
```

## 🛠️ Tecnologie

- **HTML5** - Struttura semantica
- **CSS3** - Flexbox, Grid, CSS Variables, Glassmorphism
- **JavaScript** - ES6+, async/await
- **IndexedDB** - Storage locale persistente
- **PWA** - Service Worker ready, manifest

## 📱 Compatibilità

- ✅ Chrome / Edge (desktop e mobile)
- ✅ Safari (desktop e mobile)
- ✅ Firefox
- ✅ Samsung Internet
- ✅ Opera

## 🔐 Privacy

Tutti i dati sono salvati **localmente nel browser**:

- Nessun server
- Nessun account richiesto
- Nessun tracciamento
- I dati restano sul tuo dispositivo

Per sincronizzare tra dispositivi, usa la funzione Esporta/Importa.

## 📊 Come funziona l'algoritmo

```
1. Pianifichi un task
2. Lo completi (inserendo orario reale)
3. I dati vengono salvati nello storico
4. L'algoritmo analizza i pattern:
   - Orari ricorrenti
   - Durate effettive vs pianificate
   - Giorni preferiti
   - Sequenze di task
5. Genera insights e suggerimenti
6. Può pre-compilare la routine 🪄
```

**Requisiti minimi per l'algoritmo:**

- 5 task completati → Pattern base
- 10 task completati → Suggerimenti attivi
- 14 giorni di utilizzo → Pattern settimanali

## 📝 License

MIT License

## 👨‍💻 Autore

Progetto Sviluppato open source con ❤️ da PwR per uso personale ed educativo

---

**Suggerimento:** Per ottenere il massimo dall'algoritmo, ricordati di inserire sempre gli orari reali di inizio e fine quando completi un task!
