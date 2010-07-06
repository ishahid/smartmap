#include "layermanager.h"
#include "mapwindow.h"
#include "maplayer.h"
#include <qvariant.h>
#include <qlistbox.h>
#include <qpushbutton.h>
#include <qlayout.h>
#include <qtooltip.h>
#include <qwhatsthis.h>
#include <qcolordialog.h>
#include <qpainter.h>

LayerManager::LayerManager( MapWindow* parent ) : QDialog( parent ) {

	setName( "LayerManager" );
	setSizeGripEnabled( FALSE );
	setModal( TRUE );

	listBox = new QListBox( this, "listBox" );
	listBox->setGeometry( QRect( 10, 20, 290, 360 ) );

	QWidget* privateLayoutWidget = new QWidget( this, "layout7" );
	privateLayoutWidget->setGeometry( QRect( 310, 20, 100, 360 ) );
	layout7 = new QVBoxLayout( privateLayoutWidget, 11, 6, "layout7");

	buttonUp = new QPushButton( privateLayoutWidget, "buttonUp" );
	buttonUp->setAutoDefault( true );
	layout7->addWidget( buttonUp );

	buttonDown = new QPushButton( privateLayoutWidget, "buttonDown" );
	buttonDown->setAutoDefault( true );
	layout7->addWidget( buttonDown );

	buttonFColor = new QPushButton( privateLayoutWidget, "buttonFColor" );
	buttonFColor->setAutoDefault( true );
	layout7->addWidget( buttonFColor );

	buttonLColor = new QPushButton( privateLayoutWidget, "buttonLColor" );
	buttonLColor->setAutoDefault( true );
	layout7->addWidget( buttonLColor );

	buttonDone = new QPushButton( privateLayoutWidget, "buttonDone" );
	buttonDone->setAutoDefault( true );
	buttonDone->setDefault( true );
	layout7->addWidget( buttonDone );
	QSpacerItem* spacer = new QSpacerItem( 20, 170, QSizePolicy::Minimum, QSizePolicy::Expanding );
	layout7->addItem( spacer );
	resize( QSize(409, 390).expandedTo(minimumSizeHint()) );
	clearWState( WState_Polished );

	setFixedWidth( 409 );
	setFixedHeight( 390 );
	parentWindow = parent;

	// signals and slots connections
	connect( buttonUp, SIGNAL( clicked() ), this, SLOT( moveUp() ) );
	connect( buttonDown, SIGNAL( clicked() ), this, SLOT( moveDown() ) );
	connect( buttonFColor, SIGNAL( clicked() ), this, SLOT( changeFColor() ) );
	connect( buttonLColor, SIGNAL( clicked() ), this, SLOT( changeLColor() ) );
	connect( buttonDone, SIGNAL( clicked() ), this, SLOT( accept() ) );

	languageChange();
}

LayerManager::~LayerManager() {

}

void
LayerManager::languageChange() {
	setCaption( tr( "Layer Manager" ) );
	buttonUp->setText( tr( "Move &Up" ) );
	buttonUp->setAccel( QKeySequence( tr( "Alt+U" ) ) );
	buttonDown->setText( tr( "Move &Down" ) );
	buttonDown->setAccel( QKeySequence( tr( "Alt+D" ) ) );
	buttonFColor->setText( tr( "&Fill Color" ) );
	buttonFColor->setAccel( QKeySequence( tr( "Alt+F" ) ) );
	buttonLColor->setText( tr( "&Line Color" ) );
	buttonLColor->setAccel( QKeySequence( tr( "Alt+L" ) ) );
	buttonDone->setText( tr( "D&one" ) );
	buttonDone->setAccel( QKeySequence( tr( "Alt+O" ) ) );

	QPixmap* pixmap;
	QPainter* painter;

	listBox->clear();
	for( int i=parentWindow->layerCount()-1; i>=0; i-- ) {
			pixmap = new QPixmap( 15, 15 );
			pixmap->fill( parentWindow->fillColor( i ) );
			painter = new QPainter( pixmap );
			painter->begin( pixmap );
			painter->setPen( QPen( parentWindow->lineColor( i ), 3, Qt::SolidLine ) );
			painter->drawRect( 0, 0, 15, 15 );
			painter->end();
			listBox->insertItem( *pixmap, tr( parentWindow->layerName( i ) ) );
	}

	if ( listBox->count() != 0 ) {
		listBox->setSelected( 0, true );
	}
}

void
LayerManager::moveUp() {
	int index = listBox->currentItem();

	if ( index != -1 && index != 0 ) {
		QString text = listBox->currentText();
		const QPixmap* pixmap = listBox->pixmap( index );
		QPixmap pixmap2( *pixmap );

		listBox->removeItem( index );
		listBox->insertItem( pixmap2, text, index-1 );
		listBox->setSelected( index-1, true );

		int n = parentWindow->layerCount()-( index+1 );
		MapLayer* layer = parentWindow->layerAt( n );
		parentWindow->removeLayer( n );
		parentWindow->addLayerAt( layer, n+1 );
	}
}

void
LayerManager::moveDown() {
	int index = listBox->currentItem();

	if ( index != -1 && index != listBox->count()-1 ) {
		QString text = listBox->currentText();
		const QPixmap* pixmap = listBox->pixmap( index );
		QPixmap pixmap2( *pixmap );

		listBox->removeItem( index );
		listBox->insertItem( pixmap2, text, index+1 );
		listBox->setSelected( index+1, true );

		int n = parentWindow->layerCount()-( index+1 );
		MapLayer* layer = parentWindow->layerAt( n );
		parentWindow->removeLayer( n );
		parentWindow->addLayerAt( layer, n-1 );
	}
}

void
LayerManager::changeFColor() {
	int index = listBox->currentItem();

	if ( index != -1 ) {
		int layerIndex = parentWindow->layerCount()-( index+1 );
		QColor color = QColorDialog::getColor( parentWindow->fillColor( layerIndex ), this );
		if( color.isValid() ) {
			parentWindow->setFillColor( layerIndex, color );

			int n = parentWindow->layerCount()-( index+1 );

			QPixmap* pixmap = new QPixmap( 15, 15 );
			pixmap->fill( color );

			QPainter* painter = new QPainter( pixmap );
			painter->begin( pixmap );
			painter->setPen( QPen( parentWindow->lineColor( n ), 3, Qt::SolidLine ) );
			painter->drawRect( 0, 0, 15, 15 );
			painter->end();

			listBox->changeItem( *pixmap, listBox->text( index ), index );
		}
	}
}

void
LayerManager::changeLColor() {
	int index = listBox->currentItem();

	if ( index != -1 ) {
		int layerIndex = parentWindow->layerCount()-( index+1 );
		QColor color = QColorDialog::getColor( parentWindow->lineColor( layerIndex ), this );
		if( color.isValid() ) {
			parentWindow->setLineColor( layerIndex, color );

			int n = parentWindow->layerCount()-( index+1 );

			QPixmap* pixmap = new QPixmap( 15, 15 );
			pixmap->fill( parentWindow->fillColor( n ) );

			QPainter* painter = new QPainter( pixmap );
			painter->begin( pixmap );
			painter->setPen( QPen( color, 3, Qt::SolidLine ) );
			painter->drawRect( 0, 0, 15, 15 );
			painter->end();

			listBox->changeItem( *pixmap, listBox->text( index ), index );
		}
	}
}
