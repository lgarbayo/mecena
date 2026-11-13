// Three realistic ~60 s Spanish onboarding transcripts, written the way Chrome's
// Web Speech API (es-ES) returns them: lowercase, almost no punctuation, numbers as digits,
// fillers ("eh", "bueno") kept. Each string is one *final* result (the recogniser closes a
// result at a pause). Corrections are split into their own final result on purpose, so the
// extractor sees the wrong fact first and the correction in a later call.
// All people and most organisations are fictional.

export const SCENARIOS = {
  painter: {
    mode: "creator",
    title: "Pintora gallega (Lugo)",
    finals: [
      "hola me llamo uxía ferreiro y soy pintora",
      "nací en monforte de lemos pero desde hace unos 15 años vivo en una aldea cerca de lugo en o corgo",
      "trabajo sobre todo óleo sobre lienzo de gran formato y últimamente también pigmentos naturales que preparo yo misma con tierras del río miño",
      "lo que me interesa es la memoria del paisaje rural y el abandono del campo gallego cómo el monte se queda vacío",
      "mi serie más importante se llama terra queimada son 14 cuadros sobre los incendios de 2017 en galicia",
      "la expuse en el museo provincial de lugo en 2022",
      "eh no perdona fue en 2023 en 2022 estaba todavía pintándola",
      "también estuve en una colectiva en la fundación luis seoane en a coruña",
      "estudié bellas artes en pontevedra en la universidad de vigo y en 2019 me dieron un accésit en el premio de pintura de la diputación de lugo",
      "ahora quiero empezar una serie nueva sobre las mujeres que sostienen las aldeas retratos de vecinas mías",
      "y busco ayudas para la producción y para poder exponer fuera de galicia",
    ],
  },
  illustrator: {
    mode: "creator",
    title: "Ilustrador (Valencia)",
    finals: [
      "buenas soy daniel okafor ilustrador vivo en valencia aunque me crié en vigo",
      "hago sobre todo álbum ilustrado infantil y algo de ilustración editorial para prensa",
      "trabajo en digital con procreate pero cada vez más con gouache y lápices de colores porque me gusta que se note la mano",
      "he publicado 6 álbumes con editorial faro de papel",
      "bueno 7 si cuento el que sale en marzo",
      "el último se llama la abuela que hablaba con las gaviotas es de 2024 y quedó finalista en el premio de álbum ilustrado ciudad de alicante",
      "también colaboro cada mes con la revista mar de fondo haciendo las portadas",
      "mi proyecto personal es una novela gráfica sobre el viaje de mi padre desde lagos hasta vigo en los años 80",
      "se llama la otra orilla y llevo unas 40 páginas abocetadas",
      "estudié bellas artes en la politécnica de valencia y luego un máster de ilustración en la escola massana en barcelona",
      "lo que necesito es una beca de creación para poder dedicarme 6 meses solo a la novela gráfica",
      "mi instagram es arroba dani punto dibuja",
    ],
  },
  business: {
    mode: "business",
    title: "Conservera artesanal (Boiro)",
    finals: [
      "hola soy marta castro y con mi hermana tenemos una conservera artesanal en boiro",
      "se llama conservas da ría es una sociedad limitada que montamos en 2019",
      "hacemos conservas de pescado y marisco de la ría de arousa en aceite de oliva sobre todo mejillón sardinilla y berberecho",
      "somos 4 personas mi hermana lleva la producción yo llevo la parte comercial y tenemos dos operarias",
      "bueno 5 desde septiembre que entró una chica para la tienda online",
      "vendemos a tiendas gourmet de toda españa y desde hace un año también por la web",
      "el año pasado facturamos unos 280000 euros",
      "tenemos el sello galicia calidade y en 2022 hicimos un proyecto con la universidade da coruña para aprovechar los descartes de la pesca",
      "ahora mismo los pedidos y el stock los llevamos todo con excel y papel",
      "queremos digitalizar eso y empezar a exportar a francia que nos lo piden mucho",
    ],
  },
};

// Per-work flow: the painter photographs a canvas and describes it (~25 s).
export const WORK_DESCRIPTION = {
  mode: "creator",
  title: "Ficha técnica por voz (obra de la pintora)",
  finals: [
    "esta se llama a última fía es de 2023",
    "óleo y pigmento de tierra sobre lienzo mide 130 por 97",
    "es la primera de la serie nueva de las mujeres de la aldea",
    "es mi vecina carmen hilando en la cocina quería que se viera que el trabajo de ellas es lo que mantiene viva la aldea",
    "bueno el año en realidad es 2024 la terminé en enero",
  ],
};
