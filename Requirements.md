Situation: Mein Vater, meine beiden Brüder und ich spielen öfter Siedler von Catan. Es ist aber zeitlich schwierig dass wir öfter zusammenkommen
meine idee ist, dass wir eine Website haben, wo nur wir 4 uns alle einloggen können und dann siedler spielen können. 
ziel ist es, über eien website das spiel so zu machen, dass es sich anfühlt wie ein echtes Brettspiel, also wie wenn man es als brettspiel sehen soll


- Anforderungen: wir sollen alle auf eine software zugreifen können (Website, app, etc.). 

- Jeder soll in echtzeit sehen, welchen spielzug jemand gerade macht, wer dran ist, etc. 

- wir sollen untereinander karten tauschen können. 

- es soll die Seefahrer edition verwendet werden können also mit wasser feldern und schiffen

- man soll würfeln können
 - es soll eine statistik geben die trackt, wie oft was gewürfelt wurde. 

- wir sollen die maps am anfang selbst erstellen können.
 - man soll zwischen 2 feldgrößen entscheiden können, einmal für 3 und einmal für 4 spieler
 - man soll eine random map generieren können wo alle felder zufällit auf der map sind mit den zahlen
 - man soll die random map bearbeiten können also felder verschieben und/oder zahlen verschieben können
 - die änderungen sollen die anderen spieler auf der seite in echtzeit sehen. ziel ist es dass wir es random machen und dann ausbessern
 - die felder sollen nicht komplett random sein, weil es sollen nur 2 oder 3 inseln sein. man soll am anfang auch sagen können ob wir 2 oder 3 inseln wollen. 

- jeder soll nur seine eigenen karten sehen können. 

- für uns 4 soll es ein login geben

- es soll immer ein spieler dran sein. wenn er fertig ist sagt er weiter

- es gelten die normalen Regeln mit Seefahrer Edition. die soll der user machen können

- ein spieler soll während seines Zuges tauschen können. verhandelt wird NICHT über das spiel aber wenn ein tausch eingegangen ist, dann wird der für alle spieler sichtbar gemacht. 

- Frage: meine idee war, dass ich das ganze innerhalb eines docker containers mache den ich dann einfach auf einem beliebigen server downloade und dann kann ich das spiel schon spielen

_____________________________________________________________________________________________________________________________________________________________________

Fehler nach erstem durchgang

- es soll nur ich die möglichkeit haben das spielfeld am anfang zu bearbeiten. 

- Die Map ist falsch. Rohstofffelder können am Rand der Map sein und es schaut einfach nicht so aus wie in echt. Es gibt ein Beispiel, das ich gemacht habe, und zwar gibt es ein Foto Katan Mapexamp, wo ich die Map. Fotografiert haben, als wir dieses Spiel mal in echt gespielt haben. 

- Wenn ein Spieler zwei Siedlungen an einem Feld hat, bekommt er am Anfang den Rohstoff zweimal. Momentan bekommt er ihn nur einmal. Das ist ein Fehler. 

- Ein Spieler darf immer auf allen Insel starten. Momentan ist es so, dass es eine Startinsel gibt und man auf der anderen Insel nicht starten kann. Das ist ein Fehler. 

- Das Design von den Siedlungen und den Straßen schaut absolut scheiße aus. Es soll nicht einfach nur ein Häuschen sein, sondern man soll klar erkennen können, was es an das. Was ist eine Stadt und die Straße soll auch nicht einfach nur ein Strich sein. 

- Auf der Map ist momentan viel zu viel Wasser drauf und viel zu wenig Rohstofffelder. Der ganze südliche Part, den ich gerade generiert habe. Ist zum Beispiel Wasser, und erstens erkennt man gar nicht bei den Wasfeldern, wo die Grenzen sind. Und der Süden ist komplett mit Wasser und das macht überhaupt keinen Sinn. Mehr müsste mit Rohstoffen voller sein und es sollten viel weniger Wasserfelder sein. Zwischen den Inseln reicht es, wenn eine breite Wasser ist und der Rest sind halt Rohstofffelder. So wie auf dem Foto. ich hab ein foto von der generierten map gemacht damit du siehst warum mir das überhaupt nicht gefällt  (Generierte-Map-schlechtes-beispiel-mit-viel-zu-viel-wasser)
es darf auch in einer insel sowas wie einen see geben, also 1 oder mehr wasserfelder die innerhalb einer insel sind. damit wäre es noch immer eine Insel, es macht die map halt schwerer weil die spieler sich dann nicht an 3 rohstoff felder auf einmal bauen können aber das ist ok so. 

- Das Spielverlauffeld soll nur sichtbar sein, wenn man es ausklappt. Das nimmt viel zu viel Platz weg und ich mag es auch nicht, wenn überhaupt alle Ansichten, die man hat, links sichtbar sind. Das Spielverlauffeld braucht man grundsätzlich nicht, und ich will es nur ausklappen können und das war's. Das gleiche gilt für die Würfelstatistik. Die Würfelstatistik soll nicht ständig sichtbar sein, sondern ich sie ausklappen will. Und dann kann sie auch gerne auf einer anderen Seite angezeigt werden. Das heißt, wenn ich die Würfelstatistik anschaue, muss man nicht das ganze Spielfeld sehen von mir aus, wenn das dann besser sichtbar ist. Aber es soll nicht die ganze Zeit an das Alter sich sein. 

- Jeder Spieler soll eine Karte sichtbar haben, wo draufsteht, wie viele Rohstoffe man braucht, um etwas zu bauen. Auch diese Karte soll einklappbar sein und nicht ständig sichtbar. 

- Wenn gewürfelt wird und ein Spiel eine Rohstoffkarte bekommt, dann sieht man das eigentlich nicht so wirklich, außer wenn man in den Spielverlauf schaut. Ich will, dass das klarer sichtbar wird. Also man würfelt und danach wird, keine Ahnung, kurz eingeblendet. Wer wie viele Karten bekommt und dann kann jeder Spieler das auf Pop-Feld wieder wegklicken mit X oder so, aber es muss halt klar sein, wer wie viel bekommt und nicht nur, dass das still und heimlich hingeschrieben wird. 

- Jeder Spieler hat immer fünf Siedlungen, vier Städte und 30x Straßen und 30x Schiffe zur verfügung. Ich will, dass der Spieler das irgendwo sichtbar hat, am besten weiter unten eventuell. Und dass man eine Siedlung oder eine Straße oder eine Stadt. per Drag and Drop auf das Spielfeld bringen kann. 

- Allgemein, die Grafik schaut extrem einfach, simpel und nicht sehr schön aus. Ich will eigentlich schon ein bisschen eine modernere Grafik. Damit Spielspaß auch größer ist. 

- Es gibt momentan eine Anzeige, dass die Bank noch 15 Holz, 17 Lehm und so weiter hat. Diese Anzeige macht keinen Sinn. Es gibt von allem unendlich viele Rohstoffe. und kein Limit in der Hinsicht. Das einzige, wo es ein Limit gibt, ist bei Entwicklungskarten. Da gibt es immer von jeder unterschiedlichen Entwicklungskarte Eine gewisse Anzahl, und wenn ein Spiel die zieht und nicht zurücklegt, dann ist die momentan aus dem Stapel raus. Und wenn ein Spieler sie zurücknimmt, dann wird sie nach unten in die Reihenfolge gebracht. Zu den Entwicklungskarten komme ich später noch genauer. Deswegen ist es jetzt erst einmal relativ egal, wie die Entwicklungskartionieren. Aber die Entwicklungskarten sind die einzigen, die von der Bank her ein Limit haben. Wie viel die Bank hat, ist grundsätzlich egal. Und selbst bei den Entwicklungskarten musst du es nicht einblenden, weil das ist einfach im Hintergrund und das passt schon so. 

- die Accounts sollen Felix, Günther, Kühlschrank und Jonas heißen. Felix ist der einzige account der das spielfeld am anfang bearbeiten/generieren kann. die anderen sehen nur live, was er macht

- die hänfen sollen mit stegen sein, nicht einfach nur zwei linien

- Spieler sollen am Anfang die Farbe auswählen können. Es gibt Rot, Blau, Orange und Weiß und Grün. 

neue fehler


______________________

