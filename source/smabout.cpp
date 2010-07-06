#include "smabout.h"
#include "sminfo.h"
#include <qvariant.h>
#include <qlabel.h>
#include <qlayout.h>
#include <qtooltip.h>
#include <qwhatsthis.h>
#include <qimage.h>
#include <qpixmap.h>

SMAbout::SMAbout( QWidget* parent, const char* name, bool modal, WFlags fl )
    : QDialog( parent, name, modal, fl ) {

	setName( "SMAbout" );

    pixmapLabel1 = new QLabel( this, "pixmapLabel1" );
    pixmapLabel1->setGeometry( QRect( 0, 0, 350, 95 ) );
    pixmapLabel1->setPixmap( QPixmap( "images/smartmaplogo.png" ) );
    pixmapLabel1->setScaledContents( TRUE );

    textLabel1 = new QLabel( this, "textLabel1" );
    textLabel1->setGeometry( QRect( 20, 100, 310, 130 ) );
    textLabel1->setAlignment( int( QLabel::WordBreak | QLabel::AlignTop ) );
    languageChange();
    resize( QSize(350, 240 ).expandedTo(minimumSizeHint()) );
    setFixedSize( QSize(350, 240) );
    clearWState( WState_Polished );
}

SMAbout::~SMAbout() {

}

void SMAbout::languageChange() {
    setCaption( tr( SMInfo::fullName() ) );
    textLabel1->setText( tr( SMInfo::description() ) );
}
