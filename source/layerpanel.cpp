#include "layerpanel.h"

LayerPanel::LayerPanel( Place p, QWidget * parent, const char * name, WFlags f )
		  : QDockWindow( p, parent, name, f ) {
	this->setResizeEnabled( true );
	this->setVerticallyStretchable( true );
	this->setFixedExtentWidth( 150 );
	this->setCloseMode( QDockWindow::Never );
	this->setCaption( tr( "Layers Panel" ) );
	this->setFrameShape( QFrame::NoFrame );
	this->setFrameShadow( QFrame::Plain );

	lv = new QListView( this );
	this->setWidget( lv );
	int n = lv->addColumn( "Layer Name" );
	lv->setSorting( -1 );
	lv->setColumnWidth( n, 140 );
	lv->setColumnWidthMode( n, QListView::Manual );
	QPalette op = qApp->palette();
	lv->setPaletteBackgroundColor( op.active().background() );
	lv->setFrameShape( QListView::ToolBarPanel );
	lv->setFrameShadow( QListView::Plain );
	lv->header()->setClickEnabled( false );
	lv->header()->setResizeEnabled( false );
	lv->header()->setStretchEnabled( true );
	lv->header()->adjustHeaderSize();

	connect( lv, SIGNAL( clicked( QListViewItem* ) ), this, SLOT( processClick( QListViewItem* ) ) );
}

LayerPanel::~LayerPanel() {

}

void
LayerPanel::addItem( QString& layerName, int layerIndex ) {
	QCheckListItem* const cli = new QCheckListItem( lv, NULL, layerName, QCheckListItem::CheckBox );
	cli->setState( QCheckListItem::On );
	//cli->setSelectable( false );
}

void
LayerPanel::addItemAfter( int place, QString& name ) {
	QListViewItem* after = NULL;
	int i = 0;
	while( i <= place ) {
		if ( i == 0 )
			after = lv->firstChild();
		else
			after = after->itemBelow();
		i++;
	}
	QCheckListItem* const cli = new QCheckListItem( lv, after, name, QCheckListItem::CheckBox );
	cli->setState( QCheckListItem::On );
	//cli->setSelectable( false );
}

void
LayerPanel::removeItem( int layerIndex ) {
	QListViewItem* cli = lv->firstChild();
	int i = 0;
	while( i < layerIndex ) {
		cli = cli->itemBelow();
		i++;
	}
	lv->takeItem( cli );
}

void
LayerPanel::processClick( QListViewItem* item ) {
	if ( item != NULL ) {
		QCheckListItem* cli = (QCheckListItem*)lv->firstChild();
		int i = 0;
		while( cli != item ) {
			cli = (QCheckListItem*)cli->itemBelow();
			i++;
		}
		switch( cli->state() ) {
			case QCheckListItem::NoChange	:	break;
			case QCheckListItem::Off		:	emit visibilityChanged( i, false );
												break;
			case QCheckListItem::On			:	emit visibilityChanged( i, true );
												break;
		}
	}
}

void
LayerPanel::removeAllItems() {
	lv->clear();
}

void
LayerPanel::addItem( QString& layerName, int layerIndex, bool visible ) {
	QCheckListItem* const cli = new QCheckListItem( lv, NULL, layerName, QCheckListItem::CheckBox );

	if ( visible )
		cli->setState( QCheckListItem::On );
	else
		cli->setState( QCheckListItem::Off );
}
