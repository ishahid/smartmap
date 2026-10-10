#include "removelayerdialog.h"
#include "mapwindow.h"
#include <qvariant.h>
#include <qpushbutton.h>
#include <qlistbox.h>
#include <qlayout.h>
#include <qtooltip.h>
#include <qwhatsthis.h>
#include <qimage.h>
#include <qpixmap.h>

RemoveLayerDialog::RemoveLayerDialog( MapWindow* parent ) : QDialog( parent ) {

    setName( "RemoveLayerDialog" );
    setIcon( QPixmap( "images/removelayer.png" ) );
    setSizeGripEnabled( FALSE );
    setModal( TRUE );

    QWidget* privateLayoutWidget = new QWidget( this, "Layout5" );
    privateLayoutWidget->setGeometry( QRect( 380, 10, 84, 160 ) );
    Layout5 = new QVBoxLayout( privateLayoutWidget, 0, 6, "Layout5");

    buttonRemove = new QPushButton( privateLayoutWidget, "buttonRemove" );
    buttonRemove->setAutoDefault( true );
    Layout5->addWidget( buttonRemove );

    buttonClose = new QPushButton( privateLayoutWidget, "buttonClose" );
    buttonClose->setAutoDefault( true );
    buttonClose->setDefault( true );
    Layout5->addWidget( buttonClose );
    QSpacerItem* spacer = new QSpacerItem( 20, 20, QSizePolicy::Minimum, QSizePolicy::Expanding );
    Layout5->addItem( spacer );

    listBox = new QListBox( this, "listBox" );
    listBox->setGeometry( QRect( 10, 10, 360, 161 ) );
    resize( QSize(470, 180).expandedTo(minimumSizeHint()) );
    clearWState( WState_Polished );

    setFixedWidth( 470 );
    setFixedHeight( 180 );
    parentWindow = parent;

    // signals and slots connections
    connect( buttonRemove, SIGNAL( clicked() ), this, SLOT( remove() ) );
    connect( buttonClose, SIGNAL( clicked() ), this, SLOT( accept() ) );

    languageChange();
}

RemoveLayerDialog::~RemoveLayerDialog() {

}

void
RemoveLayerDialog::languageChange() {
    setCaption( tr( "Remove Layer" ) );
    buttonRemove->setText( tr( "&Remove" ) );
    buttonRemove->setAccel( QKeySequence( tr( "Alt+R" ) ) );
    buttonClose->setText( tr( "&Close" ) );
    buttonClose->setAccel( QKeySequence( tr( "Alt+C" ) ) );

    listBox->clear();
    for( int i=parentWindow->layerCount()-1; i>=0; i-- ) {
		listBox->insertItem( tr( parentWindow->layerName( i ) ) );
	}
}

void
RemoveLayerDialog::remove() {
	int index = listBox->currentItem();

	if ( index != -1 ) {
		parentWindow->removeLayer( parentWindow->layerCount()-( index+1 ) );	// N - ( i + 1 )
		listBox->removeItem( index );
	}
}
