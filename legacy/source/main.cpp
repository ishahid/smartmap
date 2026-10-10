#include <qsplashscreen.h>
#include <qapplication.h>
#include <qtimer.h>
#include "application.h"
#include "sminfo.h"


int main( int argc, char ** argv ) {
    QApplication a( argc, argv );

	QPixmap pixmap( "images/smsplash.png" );
    QSplashScreen *splash = new QSplashScreen( pixmap );
    splash->show();

    ApplicationWindow * mw = new ApplicationWindow();
    a.setMainWidget( mw );
	mw->setCaption( SMInfo::name() );
    mw->showMaximized();
    a.connect( &a, SIGNAL(lastWindowClosed()), &a, SLOT(quit()) );

	QTimer::singleShot( 2000, splash, SLOT(close()) );

	int res = a.exec();
	delete splash;
	return res;
}
