# ConnectLife

## Présentation

Cette intégration amène dans Gladys les appareils **Hisense, Gorenje et ASKO** que vous pilotez
avec l'application **ConnectLife** : climatiseurs, déshumidificateurs, lave-linge, sèche-linge,
lave-vaisselle, fours et réfrigérateurs. Elle les lit dans le cloud ConnectLife, celui de
l'application, et pilote les climatiseurs et les déshumidificateurs.

C'est une intégration communautaire, **non affiliée à Hisense, Gorenje, ASKO ni ConnectLife**.
ConnectLife n'a pas d'API publique : l'intégration parle le protocole de l'application, tel que
la communauté l'a documenté, et peut cesser de fonctionner si le fabricant le change.

> **Développée sans le matériel** : elle a été écrite et testée sur des réponses enregistrées du
> cloud ConnectLife, pas sur un vrai appareil. Vos retours sont les bienvenus sur le forum Gladys.

## Prérequis

- Gladys Assistant **5.1.0** ou plus récent.
- Un **compte ConnectLife** (l'e-mail et le mot de passe de l'application), avec vos appareils
  déjà ajoutés dans l'application. Un compte créé avec Google, Apple ou Facebook n'a pas de mot
  de passe : ajoutez-en un dans l'application d'abord.
- Un accès à Internet depuis Gladys : tout passe par le cloud ConnectLife.

## Configuration

1. Installez l'intégration (**Intégrations → Installer depuis GitHub** si elle n'est pas encore
   dans le store).
2. Dans son onglet **Configuration**, saisissez l'**e-mail** et le **mot de passe ConnectLife**.
3. Choisissez l'**intervalle de rafraîchissement** (1, 2, 3 ou 5 minutes ; 2 par défaut). Une
   requête lit tous les appareils du compte, quel que soit leur nombre.
4. Choisissez la **langue des noms de fonctionnalités** (français par défaut).
5. Enregistrez : les appareils apparaissent dans l'onglet **Découverte**. Ajoutez ceux que vous
   voulez.

Le bouton **Lister mes appareils** lit le compte tout de suite et dit ce que l'intégration a
trouvé : chaque appareil, son type, si Gladys peut le piloter, et s'il est hors ligne.

## Appareils

Chaque appareil a une fonctionnalité **Connexion** (en ligne / hors ligne). Un appareil hors
ligne ne met à jour que celle-ci : ses autres valeurs restent celles de la dernière lecture.

### Climatiseurs

Climatiseurs muraux, mobiles et de fenêtre :

- **Marche / arrêt** — commande.
- **Mode** — auto, froid, chauffage, déshumidification, ventilation, commande. Seuls les modes
  du modèle sont proposés (les modèles de fenêtre ne chauffent pas).
- **Température de consigne** — 16 à 32 °C (30 °C pour les modèles de fenêtre), commande.
- **Vitesse de ventilation** — les vitesses du modèle, commande.
- **Température de la pièce** et **humidité de la pièce**, quand l'appareil les mesure.

Un appareil réglé en Fahrenheit est affiché et piloté en Celsius dans Gladys.

### Déshumidificateurs

- **Marche / arrêt** — commande.
- **Mode** — continu, manuel, auto, séchage du linge, commande.
- **Vitesse de ventilation** — basse, moyenne, haute, auto, commande.
- **Humidité de la pièce** et **humidité visée** (lecture seule : Gladys n'a pas de commande de
  consigne d'humidité).

### Lave-linge, sèche-linge et lave-vaisselle

En lecture seule :

- **État** — éteint, en veille, départ différé, en marche, en pause, terminé, erreur.
- **Temps restant** — en minutes, 0 hors cycle.
- **Programme** et **Phase** — le code que donne l'appareil (« Programme 9 »). Leurs noms
  dépendent du modèle et l'intégration ne les connaît pas.
- **Porte** — ouverte / fermée.

Lancer un cycle depuis Gladys n'est pas proposé : on charge et on ferme une machine devant elle.

### Fours

En lecture seule, volontairement (une source de chaleur) : **État**, **Température du four**,
**Temps restant** et **Porte**.

### Réfrigérateurs

En lecture seule : **Température du réfrigérateur** et **Température du congélateur**, avec leurs
**consignes**, pour les compartiments du modèle. Les consignes ne sont pas des commandes : une
mauvaise valeur gâterait les aliments.

### Autres appareils

Plaques, hottes, pompes à chaleur, caves à vin et les types que l'intégration ne connaît pas
encore sont listés avec leur seule **Connexion**, en lecture seule. Le bouton **Lister mes
appareils** les indique « pas encore pris en charge ».

## Widget

Le widget **Appareils ConnectLife** affiche une ligne par appareil (dix au plus) : le lave-linge
en marche et son temps restant, le lave-vaisselle terminé, le climatiseur en marche, les
températures du frigo, un appareil hors ligne. Il suit la langue du tableau de bord.

## Déclencheur de scène

**Cycle d'un appareil terminé** lance une scène quand un lave-linge, un sèche-linge ou un
lave-vaisselle termine son cycle. Choisissez éventuellement l'appareil, ou les types
d'appareils ; laissés vides, tous correspondent.

Les actions suivantes de la scène peuvent utiliser :

- `{{triggerEvent.data.device_name}}` — le nom de l'appareil ;
- `{{triggerEvent.data.appliance_type}}` — `washing_machine`, `tumble_dryer` ou `dishwasher` ;
- `{{triggerEvent.data.duration_minutes}}` — la durée pendant laquelle l'intégration a vu le
  cycle tourner ;
- `{{triggerEvent.data.program}}` — le code du programme, quand l'appareil le donne.

Un cycle arrêté à la main avant la fin ne le déclenche pas. La fin est vue à la lecture suivante
du cloud, donc avec au plus un intervalle de rafraîchissement de retard.

## Exemples de scènes

- **Le linge est prêt** : déclencheur « Cycle d'un appareil terminé », type « Lave-linge » →
  envoyer un message « Le linge est prêt ({{triggerEvent.data.duration_minutes}} min) ».
- **Rafraîchir la chambre avant le coucher** : à 21 h 30, si la chambre dépasse 26 °C → mettre
  le climatiseur de la chambre en froid, 24 °C, en marche.
- **Plus personne à la maison** : quand la dernière personne part → éteindre les climatiseurs.

## Dépannage

- **« ConnectLife a refusé l'e-mail ou le mot de passe »** : vérifiez-les dans l'application.
  L'intégration cesse alors d'essayer jusqu'à ce que vous enregistriez à nouveau la
  configuration : des échecs répétés bloquent le compte.
- **« Acceptez ses nouvelles conditions »** : ouvrez l'application ConnectLife et acceptez les
  nouvelles conditions ; l'intégration réessaie toutes les 30 minutes.
- **« Le cloud ConnectLife ne répond pas »** : le cloud ou votre accès à Internet est en panne.
  L'intégration réessaie à chaque rafraîchissement.
- **Un appareil manque** : vérifiez-le dans l'application, puis appuyez sur **Lister mes
  appareils**.
- **Une valeur semble fausse** : le sens de certains codes dépend du modèle. Ouvrez une issue avec
  le modèle de l'appareil et ce qu'affiche l'application.
- Les journaux restent calmes en fonctionnement normal ; mettez `LOG_LEVEL=debug` sur le
  conteneur pour voir chaque lecture.

## Limites

- Cloud uniquement : pas de pilotage local. Les valeurs ont au plus un intervalle de
  rafraîchissement de retard.
- Le cloud ConnectLife ne publie pas de quota ; l'intégration le lit une fois par intervalle (une
  requête pour tous les appareils) et garde ses jetons de connexion pour ne pas se reconnecter.
- Les noms des programmes et des phases ne sont pas connus : des codes seulement.
- Pas de lancement à distance des lave-linge, sèche-linge, lave-vaisselle ou fours, ni de
  commande de consigne du réfrigérateur.
- Le cloud ConnectLife européen seulement (les comptes de l'application en Europe).

## Données et confidentialité

L'e-mail et le mot de passe restent dans la configuration de Gladys. Les jetons de connexion du
cloud sont gardés dans le volume `/data` de l'intégration (fichier `connectlife-tokens.json`,
lisible par l'intégration seule), marqués d'une empreinte de l'e-mail, jamais du mot de passe.
Rien d'autre n'est stocké, et rien n'est envoyé ailleurs qu'au cloud ConnectLife.
