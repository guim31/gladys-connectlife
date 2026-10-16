// -----------------------------------------------------------------------------
// Every text the container shows, in the four languages of the Gladys
// interface. German says "du", Spanish "usted". Brand names (ConnectLife,
// Hisense, Gorenje, ASKO) are never translated.
//
// The feature names follow the `language` of the configuration (French by
// default): a device integration does not receive the language of the user.
// The widget follows the language of the dashboard, which it receives.
// -----------------------------------------------------------------------------

/** Pick the text of a language, English as a fallback. */
export function pick(texts, language) {
  return texts[language] ?? texts.en;
}

// Feature names, by stable feature key.
export const FEATURE_NAMES = {
  en: {
    connection: 'Connection',
    power: 'Power',
    mode: 'Mode',
    target_temperature: 'Target temperature',
    fan_speed: 'Fan speed',
    indoor_temperature: 'Room temperature',
    indoor_humidity: 'Room humidity',
    target_humidity: 'Target humidity',
    status: 'Status',
    remaining_time: 'Time remaining',
    program: 'Program',
    phase: 'Phase',
    door: 'Door',
    oven_temperature: 'Oven temperature',
    fridge_temperature: 'Fridge temperature',
    fridge_setpoint: 'Fridge setpoint',
    freezer_temperature: 'Freezer temperature',
    freezer_setpoint: 'Freezer setpoint',
  },
  fr: {
    connection: 'Connexion',
    power: 'Marche / arrêt',
    mode: 'Mode',
    target_temperature: 'Température de consigne',
    fan_speed: 'Vitesse de ventilation',
    indoor_temperature: 'Température de la pièce',
    indoor_humidity: 'Humidité de la pièce',
    target_humidity: 'Humidité visée',
    status: 'État',
    remaining_time: 'Temps restant',
    program: 'Programme',
    phase: 'Phase',
    door: 'Porte',
    oven_temperature: 'Température du four',
    fridge_temperature: 'Température du réfrigérateur',
    fridge_setpoint: 'Consigne du réfrigérateur',
    freezer_temperature: 'Température du congélateur',
    freezer_setpoint: 'Consigne du congélateur',
  },
  de: {
    connection: 'Verbindung',
    power: 'Ein / Aus',
    mode: 'Modus',
    target_temperature: 'Solltemperatur',
    fan_speed: 'Lüftergeschwindigkeit',
    indoor_temperature: 'Raumtemperatur',
    indoor_humidity: 'Raumfeuchtigkeit',
    target_humidity: 'Zielfeuchtigkeit',
    status: 'Status',
    remaining_time: 'Restzeit',
    program: 'Programm',
    phase: 'Phase',
    door: 'Tür',
    oven_temperature: 'Ofentemperatur',
    fridge_temperature: 'Kühlschranktemperatur',
    fridge_setpoint: 'Kühlschrank-Sollwert',
    freezer_temperature: 'Gefrierfachtemperatur',
    freezer_setpoint: 'Gefrierfach-Sollwert',
  },
  es: {
    connection: 'Conexión',
    power: 'Encendido / apagado',
    mode: 'Modo',
    target_temperature: 'Temperatura objetivo',
    fan_speed: 'Velocidad del ventilador',
    indoor_temperature: 'Temperatura de la estancia',
    indoor_humidity: 'Humedad de la estancia',
    target_humidity: 'Humedad objetivo',
    status: 'Estado',
    remaining_time: 'Tiempo restante',
    program: 'Programa',
    phase: 'Fase',
    door: 'Puerta',
    oven_temperature: 'Temperatura del horno',
    fridge_temperature: 'Temperatura del frigorífico',
    fridge_setpoint: 'Consigna del frigorífico',
    freezer_temperature: 'Temperatura del congelador',
    freezer_setpoint: 'Consigna del congelador',
  },
};

// The normalized status of an appliance (feature `status`, widget, scenes).
export const STATUS_LABELS = {
  en: {
    off: 'Off',
    standby: 'Standby',
    delayed: 'Delayed start',
    running: 'Running',
    paused: 'Paused',
    finished: 'Finished',
    error: 'Error',
    unknown: 'Unknown',
  },
  fr: {
    off: 'Éteint',
    standby: 'En veille',
    delayed: 'Départ différé',
    running: 'En marche',
    paused: 'En pause',
    finished: 'Terminé',
    error: 'Erreur',
    unknown: 'Inconnu',
  },
  de: {
    off: 'Aus',
    standby: 'Bereitschaft',
    delayed: 'Startzeitvorwahl',
    running: 'Läuft',
    paused: 'Pausiert',
    finished: 'Fertig',
    error: 'Fehler',
    unknown: 'Unbekannt',
  },
  es: {
    off: 'Apagado',
    standby: 'En espera',
    delayed: 'Inicio diferido',
    running: 'En marcha',
    paused: 'En pausa',
    finished: 'Terminado',
    error: 'Error',
    unknown: 'Desconocido',
  },
};

export const CONNECTION_LABELS = {
  en: { online: 'Online', offline: 'Offline' },
  fr: { online: 'En ligne', offline: 'Hors ligne' },
  de: { online: 'Online', offline: 'Offline' },
  es: { online: 'En línea', offline: 'Sin conexión' },
};

// Air conditioner modes and fan speeds: labels of the supported options (the
// Gladys interface shows its own translation of these standard values first).
export const AC_MODE_LABELS = {
  en: { auto: 'Auto', cooling: 'Cooling', heating: 'Heating', drying: 'Drying', fan: 'Fan' },
  fr: {
    auto: 'Auto',
    cooling: 'Froid',
    heating: 'Chauffage',
    drying: 'Déshumidification',
    fan: 'Ventilation',
  },
  de: {
    auto: 'Auto',
    cooling: 'Kühlen',
    heating: 'Heizen',
    drying: 'Entfeuchten',
    fan: 'Lüften',
  },
  es: {
    auto: 'Automático',
    cooling: 'Frío',
    heating: 'Calor',
    drying: 'Deshumidificación',
    fan: 'Ventilación',
  },
};

export const FAN_SPEED_LABELS = {
  en: {
    auto: 'Auto',
    low: 'Low',
    low_mid: 'Medium low',
    mid: 'Medium',
    mid_high: 'Medium high',
    high: 'High',
    quiet: 'Quiet',
  },
  fr: {
    auto: 'Auto',
    low: 'Basse',
    low_mid: 'Moyenne basse',
    mid: 'Moyenne',
    mid_high: 'Moyenne haute',
    high: 'Haute',
    quiet: 'Silencieux',
  },
  de: {
    auto: 'Auto',
    low: 'Niedrig',
    low_mid: 'Mittel niedrig',
    mid: 'Mittel',
    mid_high: 'Mittel hoch',
    high: 'Hoch',
    quiet: 'Leise',
  },
  es: {
    auto: 'Automática',
    low: 'Baja',
    low_mid: 'Media baja',
    mid: 'Media',
    mid_high: 'Media alta',
    high: 'Alta',
    quiet: 'Silencioso',
  },
};

// Dehumidifier modes and fan speeds (text selects: these labels are the ones shown).
export const DEHUMIDIFIER_MODE_LABELS = {
  en: { continuous: 'Continuous', manual: 'Manual', auto: 'Auto', clothes_dry: 'Laundry drying' },
  fr: {
    continuous: 'Continu',
    manual: 'Manuel',
    auto: 'Auto',
    clothes_dry: 'Séchage du linge',
  },
  de: {
    continuous: 'Dauerbetrieb',
    manual: 'Manuell',
    auto: 'Auto',
    clothes_dry: 'Wäschetrocknung',
  },
  es: {
    continuous: 'Continuo',
    manual: 'Manual',
    auto: 'Automático',
    clothes_dry: 'Secado de ropa',
  },
};

export const DEHUMIDIFIER_FAN_LABELS = {
  en: { low: 'Low', medium: 'Medium', high: 'High', auto: 'Auto' },
  fr: { low: 'Basse', medium: 'Moyenne', high: 'Haute', auto: 'Auto' },
  de: { low: 'Niedrig', medium: 'Mittel', high: 'Hoch', auto: 'Auto' },
  es: { low: 'Baja', medium: 'Media', high: 'Alta', auto: 'Automática' },
};

// Appliance kinds, for the widget and the action report.
export const KIND_LABELS = {
  en: {
    air_conditioner: 'air conditioner',
    dehumidifier: 'dehumidifier',
    washing_machine: 'washing machine',
    tumble_dryer: 'tumble dryer',
    dishwasher: 'dishwasher',
    oven: 'oven',
    refrigerator: 'refrigerator',
    unsupported: 'not supported yet',
  },
  fr: {
    air_conditioner: 'climatiseur',
    dehumidifier: 'déshumidificateur',
    washing_machine: 'lave-linge',
    tumble_dryer: 'sèche-linge',
    dishwasher: 'lave-vaisselle',
    oven: 'four',
    refrigerator: 'réfrigérateur',
    unsupported: 'pas encore pris en charge',
  },
  de: {
    air_conditioner: 'Klimaanlage',
    dehumidifier: 'Luftentfeuchter',
    washing_machine: 'Waschmaschine',
    tumble_dryer: 'Wäschetrockner',
    dishwasher: 'Geschirrspüler',
    oven: 'Backofen',
    refrigerator: 'Kühlschrank',
    unsupported: 'noch nicht unterstützt',
  },
  es: {
    air_conditioner: 'aire acondicionado',
    dehumidifier: 'deshumidificador',
    washing_machine: 'lavadora',
    tumble_dryer: 'secadora',
    dishwasher: 'lavavajillas',
    oven: 'horno',
    refrigerator: 'frigorífico',
    unsupported: 'aún no compatible',
  },
};

// Program and phase: the raw code the appliance reports (their names depend
// on the model, see docs).
export const CODE_TEXT = {
  en: { program: (code) => `Program ${code}`, phase: (code) => `Phase ${code}` },
  fr: { program: (code) => `Programme ${code}`, phase: (code) => `Phase ${code}` },
  de: { program: (code) => `Programm ${code}`, phase: (code) => `Phase ${code}` },
  es: { program: (code) => `Programa ${code}`, phase: (code) => `Fase ${code}` },
};

// Application-level status of the Configuration screen.
export const CONNECTION_TEXT = {
  notConfigured: {
    en: 'Enter the e-mail and password of your ConnectLife account.',
    fr: 'Saisissez l’e-mail et le mot de passe de votre compte ConnectLife.',
    de: 'Gib die E-Mail-Adresse und das Passwort deines ConnectLife-Kontos ein.',
    es: 'Introduzca el correo electrónico y la contraseña de su cuenta ConnectLife.',
  },
  credentialsRefused: {
    en: 'ConnectLife refused the e-mail or the password. Check them, then save again.',
    fr: 'ConnectLife a refusé l’e-mail ou le mot de passe. Vérifiez-les, puis enregistrez à nouveau.',
    de: 'ConnectLife hat die E-Mail-Adresse oder das Passwort abgelehnt. Prüfe sie und speichere erneut.',
    es: 'ConnectLife ha rechazado el correo o la contraseña. Compruébelos y vuelva a guardar.',
  },
  termsNotAccepted: {
    en: 'Open the ConnectLife app and accept its updated terms: the login is refused until then.',
    fr: 'Ouvrez l’application ConnectLife et acceptez ses nouvelles conditions : la connexion est refusée d’ici là.',
    de: 'Öffne die ConnectLife-App und akzeptiere die neuen Bedingungen: Bis dahin wird die Anmeldung abgelehnt.',
    es: 'Abra la aplicación ConnectLife y acepte sus nuevas condiciones: hasta entonces se rechaza el inicio de sesión.',
  },
  locked: {
    en: 'ConnectLife locked the account after too many attempts. Wait, then save the configuration again.',
    fr: 'ConnectLife a bloqué le compte après trop de tentatives. Patientez, puis enregistrez à nouveau la configuration.',
    de: 'ConnectLife hat das Konto nach zu vielen Versuchen gesperrt. Warte und speichere die Konfiguration dann erneut.',
    es: 'ConnectLife ha bloqueado la cuenta tras demasiados intentos. Espere y vuelva a guardar la configuración.',
  },
  unreachable: {
    en: 'The ConnectLife cloud does not answer. The integration tries again at each refresh.',
    fr: 'Le cloud ConnectLife ne répond pas. L’intégration réessaie à chaque rafraîchissement.',
    de: 'Die ConnectLife-Cloud antwortet nicht. Die Integration versucht es bei jeder Aktualisierung erneut.',
    es: 'La nube de ConnectLife no responde. La integración lo vuelve a intentar en cada actualización.',
  },
  initFailed: {
    en: 'Initialization failed, check the integration logs.',
    fr: 'L’initialisation a échoué, consultez les journaux de l’intégration.',
    de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
    es: 'La inicialización ha fallado, consulte los registros de la integración.',
  },
};

// The report of the "List my appliances" action.
export const ACTION_TEXT = {
  en: {
    none: 'No appliance on this ConnectLife account.',
    count: (n) => `${n} appliance(s):`,
    controllable: 'controllable',
    readOnly: 'read only',
    offline: 'offline',
  },
  fr: {
    none: 'Aucun appareil sur ce compte ConnectLife.',
    count: (n) => `${n} appareil(s) :`,
    controllable: 'pilotable',
    readOnly: 'lecture seule',
    offline: 'hors ligne',
  },
  de: {
    none: 'Kein Gerät in diesem ConnectLife-Konto.',
    count: (n) => `${n} Gerät(e):`,
    controllable: 'steuerbar',
    readOnly: 'nur lesen',
    offline: 'offline',
  },
  es: {
    none: 'No hay ningún aparato en esta cuenta ConnectLife.',
    count: (n) => `${n} aparato(s):`,
    controllable: 'controlable',
    readOnly: 'solo lectura',
    offline: 'sin conexión',
  },
};

// Dashboard widget.
export const WIDGET_TEXT = {
  en: {
    notConfigured: 'Configure your ConnectLife account in the integration.',
    empty: 'No appliance to show yet.',
    unreachable: 'The ConnectLife cloud does not answer.',
    minutesLeft: (n) => `${n} min left`,
  },
  fr: {
    notConfigured: 'Configurez votre compte ConnectLife dans l’intégration.',
    empty: 'Aucun appareil à afficher pour l’instant.',
    unreachable: 'Le cloud ConnectLife ne répond pas.',
    minutesLeft: (n) => `encore ${n} min`,
  },
  de: {
    notConfigured: 'Richte dein ConnectLife-Konto in der Integration ein.',
    empty: 'Noch kein Gerät anzuzeigen.',
    unreachable: 'Die ConnectLife-Cloud antwortet nicht.',
    minutesLeft: (n) => `noch ${n} Min.`,
  },
  es: {
    notConfigured: 'Configure su cuenta ConnectLife en la integración.',
    empty: 'Todavía no hay ningún aparato que mostrar.',
    unreachable: 'La nube de ConnectLife no responde.',
    minutesLeft: (n) => `quedan ${n} min`,
  },
};

// Errors returned to Gladys when a command cannot be sent.
export const COMMAND_TEXT = {
  en: {
    offline: 'The appliance is offline.',
    unsupported: 'This value is not supported by the appliance.',
  },
  fr: {
    offline: 'L’appareil est hors ligne.',
    unsupported: 'Cette valeur n’est pas prise en charge par l’appareil.',
  },
  de: {
    offline: 'Das Gerät ist offline.',
    unsupported: 'Dieser Wert wird vom Gerät nicht unterstützt.',
  },
  es: {
    offline: 'El aparato está sin conexión.',
    unsupported: 'El aparato no admite este valor.',
  },
};
